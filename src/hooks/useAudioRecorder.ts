import { useState, useRef, useCallback } from "react";

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<ArrayBuffer | null>;
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // collect data every 100ms
      setIsRecording(true);
    } catch (e) {
      setError(`Microphone access denied: ${e}`);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        setIsRecording(false);
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        setIsRecording(false);

        // Convert webm to WAV using OfflineAudioContext
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioCtx = new AudioContext({ sampleRate: 16000 });
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          await audioCtx.close();

          const wavBuffer = audioBufferToWav(audioBuffer);
          resolve(wavBuffer);
        } catch (e) {
          setError(`Audio conversion failed: ${e}`);
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording, error };
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 3; // IEEE float
  const bitDepth = 32;

  const channelData = buffer.getChannelData(0);
  const dataLength = channelData.length * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    view.setFloat32(offset, channelData[i], true);
    offset += 4;
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
