export class VoiceClient {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Try to use a compatible MIME type
    const mimeType = this.getCompatibleMimeType();
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.mediaRecorder.start();
  }

  async stopRecording(): Promise<Blob> {
    if (!this.mediaRecorder) {
      throw new Error("MediaRecorder not initialized");
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("MediaRecorder not initialized"));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        // Stop all tracks to release the microphone
        if (this.mediaRecorder?.stream) {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        resolve(audioBlob);
      };

      this.mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`));
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        // Already stopped, resolve immediately
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        resolve(audioBlob);
      }
    });
  }

  async sendAudio(
    sessionId: string,
    audioBlob: Blob,
    apiUrl: string = 'http://localhost:8000'
  ): Promise<{
    audioResponse: Blob;
    userText: string;
    assistantText: string;
  }> {
    const formData = new FormData();

    // Determine file extension based on MIME type
    const extension = this.getExtensionFromMimeType(audioBlob.type);
    formData.append('audio', audioBlob, `recording.${extension}`);

    const response = await fetch(
      `${apiUrl}/api/v1/conversations/${encodeURIComponent(sessionId)}/turns`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to process audio: ${response.statusText} - ${errorText}`);
    }

    // Decode URL-encoded header values
    const userTextEncoded = response.headers.get('X-User-Text') || '';
    const assistantTextEncoded = response.headers.get('X-Assistant-Text') || '';

    return {
      audioResponse: await response.blob(),
      userText: userTextEncoded ? decodeURIComponent(userTextEncoded) : '',
      assistantText: assistantTextEncoded ? decodeURIComponent(assistantTextEncoded) : '',
    };
  }

  playAudio(audioBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop any currently playing audio
      this.stopAudio();

      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = (error) => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        reject(new Error(`Audio playback error: ${error}`));
      };

      audio.play().catch(reject);
    });
  }

  stopAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  cleanup(): void {
    this.stopAudio();

    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (this.mediaRecorder.stream) {
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      this.mediaRecorder = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioChunks = [];
  }

  private getCompatibleMimeType(): string {
    // Try different MIME types in order of preference
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback to default
    return '';
  }

  private getExtensionFromMimeType(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm'; // default fallback
  }
}
