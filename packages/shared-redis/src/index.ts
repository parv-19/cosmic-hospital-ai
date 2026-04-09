import Redis from "ioredis";

type StoredValue = {
  value: string;
  expiresAt?: number;
};

export type RedisClientLike = {
  mode: "redis" | "memory";
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<"OK">;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  quit(): Promise<void>;
};

class InMemoryRedisClient implements RedisClientLike {
  public readonly mode = "memory" as const;
  private readonly store = new Map<string, StoredValue>();

  async connect(): Promise<void> {
    return;
  }

  async get(key: string): Promise<string | null> {
    const record = this.store.get(key);

    if (!record) {
      return null;
    }

    if (record.expiresAt && record.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return record.value;
  }

  async set(key: string, value: string): Promise<"OK"> {
    const existing = this.store.get(key);

    this.store.set(key, {
      value,
      expiresAt: existing?.expiresAt
    });

    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const currentValue = await this.get(key);
    const numericValue = currentValue ? Number(currentValue) : 0;
    const nextValue = Number.isNaN(numericValue) ? 1 : numericValue + 1;

    this.store.set(key, {
      value: String(nextValue)
    });

    return nextValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const record = this.store.get(key);

    if (!record) {
      return 0;
    }

    this.store.set(key, {
      ...record,
      expiresAt: Date.now() + seconds * 1000
    });

    return 1;
  }

  async quit(): Promise<void> {
    this.store.clear();
  }
}

class SharedRedisClient implements RedisClientLike {
  private readonly memoryClient = new InMemoryRedisClient();
  private readonly redisClient: Redis;
  private hasLoggedAvailability = false;
  private activeClient: RedisClientLike = this.memoryClient;

  public mode: "redis" | "memory" = "memory";

  constructor(url: string) {
    this.redisClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    this.redisClient.on("error", () => {
      // Connection fallback is handled in connect(); avoid noisy unhandled events.
    });
  }

  async connect(): Promise<void> {
    try {
      await this.redisClient.connect();
      this.activeClient = {
        mode: "redis",
        connect: async () => undefined,
        get: (key: string) => this.redisClient.get(key),
        set: (key: string, value: string) => this.redisClient.set(key, value) as Promise<"OK">,
        del: (key: string) => this.redisClient.del(key),
        incr: (key: string) => this.redisClient.incr(key),
        expire: (key: string, seconds: number) => this.redisClient.expire(key, seconds),
        quit: async () => {
          await this.redisClient.quit();
        }
      };
      this.mode = "redis";

      if (!this.hasLoggedAvailability) {
        console.log("Redis connected");
        this.hasLoggedAvailability = true;
      }
    } catch {
      this.activeClient = this.memoryClient;
      this.mode = "memory";

      if (!this.hasLoggedAvailability) {
        console.log("Redis unavailable, using in-memory fallback for development");
        this.hasLoggedAvailability = true;
      }
    }
  }

  async get(key: string): Promise<string | null> {
    return this.activeClient.get(key);
  }

  async set(key: string, value: string): Promise<"OK"> {
    return this.activeClient.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.activeClient.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.activeClient.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.activeClient.expire(key, seconds);
  }

  async quit(): Promise<void> {
    await this.activeClient.quit();
  }
}

export function createRedisClient(url: string): RedisClientLike {
  return new SharedRedisClient(url);
}

export async function connectRedis(client: RedisClientLike): Promise<void> {
  await client.connect();
}


