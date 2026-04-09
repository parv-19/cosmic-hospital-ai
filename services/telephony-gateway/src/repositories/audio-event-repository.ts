export type AudioEventRecord = {
  callId: string;
  chunkSize: number;
  receivedAt: string;
};

const audioEvents: AudioEventRecord[] = [];

export class AudioEventRepository {
  async add(record: AudioEventRecord): Promise<void> {
    audioEvents.push(record);
  }

  async list(): Promise<AudioEventRecord[]> {
    return audioEvents;
  }
}

