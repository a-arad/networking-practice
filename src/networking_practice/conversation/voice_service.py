"""Turn-based voice conversation service using Whisper, Chat Completions, and TTS."""

from __future__ import annotations

import io
from typing import BinaryIO

from openai import AsyncOpenAI, OpenAI

from networking_practice.core.config import Settings
from networking_practice.core.logging import get_logger
from networking_practice.conversation.models import ParticipantRole

logger = get_logger(__name__)


class VoiceConversationService:
    """Turn-based voice conversation service (Whisper → Chat → TTS)."""

    def __init__(self, settings: Settings):
        """Initialize voice service with OpenAI clients.

        Args:
            settings: Application settings with API keys and model config.
        """
        self.settings = settings
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.async_client = AsyncOpenAI(api_key=settings.openai_api_key)

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
        """Generate response using Chat Completions API.

        Args:
            messages: Conversation history in OpenAI format.
            instructions: System instructions for the conversation.

        Returns:
            Generated response text.

        Raises:
            Exception: If generation fails.
        """
        try:
            # Build messages list with optional system message
            full_messages = []
            if instructions:
                full_messages.append({"role": "system", "content": instructions})
            full_messages.extend(messages)

            completion = self.client.chat.completions.create(
                model=self.settings.chat_model,
                messages=full_messages,
                temperature=self.settings.chat_temperature,
                max_tokens=self.settings.chat_max_tokens,
            )

            response_text = completion.choices[0].message.content or ""

            logger.info(
                "Generated chat response",
                extra={
                    "model": self.settings.chat_model,
                    "response_length": len(response_text),
                    "usage": completion.usage.model_dump() if completion.usage else None,
                },
            )

            return response_text

        except Exception as error:
            logger.error(
                "Response generation failed",
                extra={"error": str(error)},
            )
            raise

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
        user_text = self.transcribe_audio(audio_input)

        # Step 2: Add to history and generate response
        messages = conversation_history + [{"role": "user", "content": user_text}]
        assistant_text = self.generate_response(messages, instructions)

        # Step 3: Synthesize speech
        audio_response = self.synthesize_speech(assistant_text, voice)

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
