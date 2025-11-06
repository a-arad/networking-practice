"""Turn-based voice conversation service using Whisper, Chat Completions, and TTS."""

from __future__ import annotations

import io
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

import anthropic
from openai import AsyncOpenAI, OpenAI

from networking_practice.core.config import Settings
from networking_practice.core.logging import get_logger
from networking_practice.conversation.models import ParticipantRole

logger = get_logger(__name__)


def get_git_commit() -> str:
    """Get current git commit hash (short form).

    Returns:
        Short commit hash or 'unknown' if not in a git repo.
    """
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return "unknown"


class VoiceConversationService:
    """Turn-based voice conversation service (Whisper → Chat → TTS)."""

    def __init__(self, settings: Settings):
        """Initialize voice service with OpenAI and Anthropic clients.

        Args:
            settings: Application settings with API keys and model config.
        """
        self.settings = settings
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.async_client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.anthropic_client = (
            anthropic.Anthropic(api_key=settings.anthropic_api_key)
            if settings.anthropic_api_key
            else None
        )

    def transcribe_audio(self, audio_data: bytes | BinaryIO) -> str:
        """Transcribe audio to text using Whisper.

        Args:
            audio_data: Audio file bytes or file-like object.

        Returns:
            Transcribed text.

        Raises:
            Exception: If transcription fails.
        """
        try:
            # If bytes, wrap in BytesIO
            if isinstance(audio_data, bytes):
                audio_file = io.BytesIO(audio_data)
                audio_file.name = "audio.webm"  # Provide a name for format detection
            else:
                audio_file = audio_data

            transcription = self.client.audio.transcriptions.create(
                model=self.settings.whisper_model,
                file=audio_file,
                response_format="text",
            )

            # transcription is a string when response_format="text"
            text = transcription if isinstance(transcription, str) else transcription.text

            logger.info(
                "Transcribed audio",
                extra={
                    "model": self.settings.whisper_model,
                    "text_length": len(text),
                },
            )

            return text

        except Exception as error:
            logger.error(
                "Audio transcription failed",
                extra={"error": str(error)},
            )
            raise

    def generate_response(
        self,
        messages: list[dict[str, str]],
        instructions: str | None = None,
    ) -> str:
        """Generate response using Chat Completions API (OpenAI or Anthropic).

        Args:
            messages: Conversation history in OpenAI format.
            instructions: System instructions for the conversation.

        Returns:
            Generated response text.

        Raises:
            Exception: If generation fails.
        """
        try:
            # Check if using Claude
            if self.settings.chat_model.startswith("claude"):
                if not self.anthropic_client:
                    raise ValueError("Anthropic API key not configured for Claude model")
                return self._generate_claude_response(messages, instructions)

            # OpenAI path
            # Build messages list with optional system message
            full_messages = []
            if instructions:
                full_messages.append({"role": "system", "content": instructions})
            full_messages.extend(messages)

            # Build completion params (GPT-5 models have different supported params)
            completion_params = {
                "model": self.settings.chat_model,
                "messages": full_messages,
            }

            # GPT-5 models support max_completion_tokens but not temperature
            if self.settings.chat_model.startswith("gpt-5"):
                # Don't set max_completion_tokens - reasoning tokens consume the budget
                pass
            else:
                # For older models, include temperature and max_tokens
                completion_params["temperature"] = self.settings.chat_temperature
                if self.settings.chat_max_tokens is not None:
                    completion_params["max_tokens"] = self.settings.chat_max_tokens

            completion = self.client.chat.completions.create(**completion_params)

            response_text = completion.choices[0].message.content or ""

            # Ensure response is not empty (fallback for edge cases)
            if not response_text or not response_text.strip():
                logger.warning(
                    f"Empty response from chat model! finish_reason={completion.choices[0].finish_reason}, "
                    f"params={completion_params}"
                )
                response_text = "..."  # Minimal fallback to prevent TTS error

            logger.info(
                "Generated chat response",
                extra={
                    "model": self.settings.chat_model,
                    "response_text": response_text[:100],  # First 100 chars
                    "response_length": len(response_text),
                    "usage": completion.usage.model_dump() if completion.usage else None,
                    "finish_reason": completion.choices[0].finish_reason,
                },
            )

            return response_text

        except Exception as error:
            logger.error(
                "Response generation failed",
                extra={"error": str(error)},
            )
            raise

    def _generate_claude_response(
        self,
        messages: list[dict[str, str]],
        instructions: str | None = None,
    ) -> str:
        """Generate response using Anthropic Claude API.

        Args:
            messages: Conversation history in OpenAI format.
            instructions: System instructions for the conversation.

        Returns:
            Generated response text.
        """
        # Convert OpenAI format to Anthropic format
        anthropic_messages = []
        for msg in messages:
            if msg["role"] != "system":  # Claude uses separate system param
                anthropic_messages.append({"role": msg["role"], "content": msg["content"]})

        # Build request params
        request_params = {
            "model": self.settings.chat_model,
            "max_tokens": 1024,  # Claude requires max_tokens, reasonable default
            "messages": anthropic_messages,
        }

        if instructions:
            request_params["system"] = instructions

        # Call Claude API
        response = self.anthropic_client.messages.create(**request_params)

        response_text = response.content[0].text if response.content else ""

        logger.info(
            "Generated chat response",
            extra={
                "model": self.settings.chat_model,
                "response_text": response_text[:100],
                "response_length": len(response_text),
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
                "stop_reason": response.stop_reason,
            },
        )

        return response_text

    async def generate_response_stream(
        self,
        messages: list[dict[str, str]],
        instructions: str | None = None,
    ):
        """Generate streaming response using Chat Completions API.

        Args:
            messages: Conversation history in OpenAI format.
            instructions: System instructions for the conversation.

        Yields:
            Text chunks as they arrive.

        Raises:
            Exception: If generation fails.
        """
        try:
            # Build messages list with optional system message
            full_messages = []
            if instructions:
                full_messages.append({"role": "system", "content": instructions})
            full_messages.extend(messages)

            stream = await self.async_client.chat.completions.create(
                model=self.settings.chat_model,
                messages=full_messages,
                temperature=self.settings.chat_temperature,
                max_tokens=self.settings.chat_max_tokens,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as error:
            logger.error(
                "Streaming response generation failed",
                extra={"error": str(error)},
            )
            raise

    def synthesize_speech(self, text: str, voice: str | None = None) -> bytes:
        """Convert text to speech using TTS API.

        Args:
            text: Text to convert to speech.
            voice: Voice to use (defaults to config setting).

        Returns:
            Audio data as bytes (MP3 format).

        Raises:
            Exception: If synthesis fails.
        """
        try:
            selected_voice = voice or self.settings.tts_voice

            # Use streaming response to get audio bytes
            with self.client.audio.speech.with_streaming_response.create(
                model=self.settings.tts_model,
                voice=selected_voice,
                input=text,
            ) as response:
                audio_data = response.read()

            logger.info(
                "Synthesized speech",
                extra={
                    "model": self.settings.tts_model,
                    "voice": selected_voice,
                    "text_length": len(text),
                    "audio_size": len(audio_data),
                },
            )

            return audio_data

        except Exception as error:
            logger.error(
                "Speech synthesis failed",
                extra={"error": str(error)},
            )
            raise

    def process_turn(
        self,
        audio_input: bytes | BinaryIO,
        conversation_history: list[dict[str, str]],
        instructions: str | None = None,
        voice: str | None = None,
    ) -> tuple[str, str, bytes]:
        """Process a complete conversation turn (STT → Chat → TTS).

        Args:
            audio_input: User's audio input.
            conversation_history: Previous conversation messages.
            instructions: System instructions for the AI.
            voice: Voice to use for TTS.

        Returns:
            Tuple of (user_text, assistant_text, audio_response).

        Raises:
            Exception: If any step fails.
        """
        # Step 1: Transcribe user audio
        start = time.perf_counter()
        user_text = self.transcribe_audio(audio_input)
        transcribe_ms = (time.perf_counter() - start) * 1000

        # Step 2: Add to history and generate response
        messages = conversation_history + [{"role": "user", "content": user_text}]
        start = time.perf_counter()
        assistant_text = self.generate_response(messages, instructions)
        chat_ms = (time.perf_counter() - start) * 1000

        # Step 3: Synthesize speech
        start = time.perf_counter()
        audio_response = self.synthesize_speech(assistant_text, voice)
        tts_ms = (time.perf_counter() - start) * 1000

        # Log latency metrics
        Path("logs").mkdir(exist_ok=True)
        with open("logs/latency.jsonl", "a") as f:
            f.write(
                json.dumps(
                    {
                        "timestamp": datetime.now().isoformat(),
                        "commit": get_git_commit(),
                        "transcribe_ms": transcribe_ms,
                        "transcribe_model": self.settings.whisper_model,
                        "chat_ms": chat_ms,
                        "chat_model": self.settings.chat_model,
                        "tts_ms": tts_ms,
                        "tts_model": self.settings.tts_model,
                        "total_ms": transcribe_ms + chat_ms + tts_ms,
                    }
                )
                + "\n"
            )

        logger.info(
            "Completed conversation turn",
            extra={
                "user_text_length": len(user_text),
                "assistant_text_length": len(assistant_text),
                "audio_size": len(audio_response),
            },
        )

        return user_text, assistant_text, audio_response


__all__ = ["VoiceConversationService"]
