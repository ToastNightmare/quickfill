import {
  QUICKFILL_CORE_DB_VERSION,
  QUICKFILL_DB_NAME,
  QUICKFILL_MAX_SESSION_AGE_MS,
  QUICKFILL_MEDIA_ASSET_STORE,
  QUICKFILL_MEDIA_BINDING_KEY,
  QUICKFILL_MEDIA_DB_VERSION,
  QUICKFILL_MEDIA_SESSION_STORE,
  QUICKFILL_PDF_KEY,
  QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
  QUICKFILL_PDF_STORE,
  QUICKFILL_PDF_TIMESTAMP_KEY,
  QUICKFILL_TIMESTAMP_STORE,
  cleanupOldIndexedDBSessions,
  loadPdfFromIndexedDB,
  runQuickFillMediaTransaction,
  savePdfToIndexedDB,
} from "@/lib/persistence";

type StoredValue = {
  keyPath: string | null;
  values: Map<IDBValidKey, unknown>;
};

type FakeDatabaseState = {
  version: number;
  stores: Map<string, StoredValue>;
};

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.(new Event("success")));
  }

  fail(error: DOMException): void {
    this.error = error;
    queueMicrotask(() => this.onerror?.(new Event("error")));
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  private pending = 0;
  private completionQueued = false;
  private active = true;

  constructor(
    private readonly state: FakeDatabaseState,
    private readonly storeNames: readonly string[],
    readonly mode: IDBTransactionMode,
    private readonly onStoreUse: (storeName: string) => void,
    private readonly takeRequestFailure: () => DOMException | null,
    private readonly completionFailure: "abort" | "error" | null,
  ) {
    this.queueCompletion();
  }

  objectStore(storeName: string): IDBObjectStore {
    if (!this.storeNames.includes(storeName)) {
      throw new DOMException("Store is outside the transaction", "NotFoundError");
    }
    const store = this.state.stores.get(storeName);
    if (!store) throw new DOMException("Store is missing", "NotFoundError");
    this.onStoreUse(storeName);
    const request = <T>(operation: () => T): IDBRequest<T> => {
      const result = new FakeRequest<T>();
      this.pending += 1;
      queueMicrotask(() => {
        if (!this.active) return;
        try {
          const forcedFailure = this.takeRequestFailure();
          if (forcedFailure) throw forcedFailure;
          result.succeed(operation());
        } catch (error) {
          const failure =
            error instanceof DOMException
              ? error
              : new DOMException("Fake request failed", "AbortError");
          result.fail(failure);
          this.error = failure;
          this.onerror?.(new Event("error"));
        } finally {
          this.pending -= 1;
          this.queueCompletion();
        }
      });
      return result as unknown as IDBRequest<T>;
    };

    return {
      get: (key: IDBValidKey) => request(() => store.values.get(key)),
      getAll: () => request(() => [...store.values.values()]),
      getAllKeys: () => request(() => [...store.values.keys()]),
      put: (value: unknown, suppliedKey?: IDBValidKey) =>
        request(() => {
          if (this.mode === "readonly") {
            throw new DOMException("Readonly transaction", "ReadOnlyError");
          }
          const derivedKey =
            store.keyPath && value && typeof value === "object"
              ? (value as Record<string, IDBValidKey>)[store.keyPath]
              : suppliedKey;
          if (derivedKey === undefined) {
            throw new DOMException("A key is required", "DataError");
          }
          store.values.set(derivedKey, value);
          return derivedKey;
        }),
      delete: (key: IDBValidKey) =>
        request(() => {
          store.values.delete(key);
          return undefined;
        }),
      clear: () =>
        request(() => {
          store.values.clear();
          return undefined;
        }),
    } as unknown as IDBObjectStore;
  }

  abort(): void {
    if (!this.active) {
      throw new DOMException("Transaction is inactive", "InvalidStateError");
    }
    this.active = false;
    this.error = new DOMException("Transaction aborted", "AbortError");
    queueMicrotask(() => this.onabort?.(new Event("abort")));
  }

  private queueCompletion(): void {
    if (this.completionQueued || !this.active) return;
    this.completionQueued = true;
    setTimeout(() => {
      this.completionQueued = false;
      if (!this.active || this.pending > 0) return;
      this.active = false;
      if (this.completionFailure) {
        this.error = new DOMException(
          `Transaction ${this.completionFailure}`,
          "AbortError",
        );
        if (this.completionFailure === "abort") {
          this.onabort?.(new Event("abort"));
        } else {
          this.onerror?.(new Event("error"));
        }
        return;
      }
      this.oncomplete?.(new Event("complete"));
    }, 0);
  }
}

class FakeDatabase {
  onversionchange: ((event: Event) => void) | null = null;

  constructor(
    private readonly state: FakeDatabaseState,
    private readonly onTransaction: (storeNames: readonly string[]) => void,
    private readonly onStoreUse: (storeName: string) => void,
    private readonly takeRequestFailure: () => DOMException | null,
    private readonly completionFailure: "abort" | "error" | null,
    private readonly triggerVersionChangeOnTransaction: boolean,
    private readonly onClose: () => void,
  ) {}

  get version(): number {
    return this.state.version;
  }

  get objectStoreNames(): DOMStringList {
    const names = [...this.state.stores.keys()];
    return {
      contains: (name: string) => names.includes(name),
      item: (index: number) => names[index] ?? null,
      length: names.length,
      [Symbol.iterator]: () => names[Symbol.iterator](),
    } as unknown as DOMStringList;
  }

  createObjectStore(
    name: string,
    options?: IDBObjectStoreParameters,
  ): IDBObjectStore {
    if (this.state.stores.has(name)) {
      throw new DOMException("Store already exists", "ConstraintError");
    }
    this.state.stores.set(name, {
      keyPath: typeof options?.keyPath === "string" ? options.keyPath : null,
      values: new Map(),
    });
    return {} as IDBObjectStore;
  }

  transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = "readonly",
  ): IDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.onTransaction(names);
    const transaction = new FakeTransaction(
      this.state,
      names,
      mode,
      this.onStoreUse,
      this.takeRequestFailure,
      this.completionFailure,
    ) as unknown as IDBTransaction;
    if (this.triggerVersionChangeOnTransaction) {
      queueMicrotask(() => this.onversionchange?.(new Event("versionchange")));
    }
    return transaction;
  }

  close(): void {
    this.onClose();
  }
}

class FakeIndexedDb {
  readonly openVersions: Array<number | undefined> = [];
  readonly transactionStoreSets: string[][] = [];
  readonly usedStores: string[] = [];
  readonly state: FakeDatabaseState;
  requestFailure: DOMException | null = null;
  completionFailure: "abort" | "error" | null = null;
  triggerVersionChangeOnTransaction = false;
  closeCalls = 0;

  constructor(version = 0) {
    this.state = { version, stores: new Map() };
  }

  seedCore(pdf: ArrayBuffer, timestamp = Date.now()): void {
    this.ensureStore(QUICKFILL_PDF_STORE).values.set(QUICKFILL_PDF_KEY, pdf);
    this.ensureStore(QUICKFILL_TIMESTAMP_STORE).values.set(
      QUICKFILL_PDF_TIMESTAMP_KEY,
      timestamp,
    );
  }

  ensureStore(name: string, keyPath: string | null = null): StoredValue {
    let store = this.state.stores.get(name);
    if (!store) {
      store = { keyPath, values: new Map() };
      this.state.stores.set(name, store);
    }
    return store;
  }

  open(name: string, requestedVersion?: number): IDBOpenDBRequest {
    expect(name).toBe(QUICKFILL_DB_NAME);
    this.openVersions.push(requestedVersion);
    const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & {
      onupgradeneeded: ((event: Event) => void) | null;
      onblocked: ((event: Event) => void) | null;
      transaction: { abort: () => void } | null;
    };
    request.onupgradeneeded = null;
    request.onblocked = null;
    let upgradeAborted = false;
    request.transaction = {
      abort: () => {
        upgradeAborted = true;
      },
    };

    queueMicrotask(() => {
      if (
        requestedVersion !== undefined &&
        requestedVersion < this.state.version
      ) {
        request.fail(
          new DOMException("Requested version is older", "VersionError"),
        );
        return;
      }
      const targetVersion =
        requestedVersion ??
        (this.state.version === 0 ? 1 : this.state.version);
      const needsUpgrade = targetVersion > this.state.version;
      if (needsUpgrade) this.state.version = targetVersion;
      const database = new FakeDatabase(
        this.state,
        (stores) => this.transactionStoreSets.push([...stores]),
        (store) => this.usedStores.push(store),
        () => {
          const failure = this.requestFailure;
          this.requestFailure = null;
          return failure;
        },
        this.completionFailure,
        this.triggerVersionChangeOnTransaction,
        () => {
          this.closeCalls += 1;
        },
      );
      request.result = database as unknown as IDBDatabase;
      if (needsUpgrade) {
        request.onupgradeneeded?.(new Event("upgradeneeded"));
      }
      if (upgradeAborted) {
        request.fail(new DOMException("Upgrade aborted", "AbortError"));
        return;
      }
      request.succeed(database as unknown as IDBDatabase);
    });
    return request as unknown as IDBOpenDBRequest;
  }
}

describe("QuickFill IndexedDB ownership", () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalAddMediaFlag =
    process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalAddMediaFlag === undefined) {
      delete process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;
    } else {
      process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA = originalAddMediaFlag;
    }
    warnSpy.mockRestore();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb,
    });
  });

  function install(fake: FakeIndexedDb): void {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: fake as unknown as IDBFactory,
    });
  }

  function installOpenFailure(
    event: "blocked" | "error",
    error = new DOMException("IndexedDB open failed", "AbortError"),
  ): void {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open: () => {
          const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & {
            onupgradeneeded: ((event: Event) => void) | null;
            onblocked: ((event: Event) => void) | null;
            transaction: null;
          };
          request.onupgradeneeded = null;
          request.onblocked = null;
          request.transaction = null;
          queueMicrotask(() => {
            if (event === "blocked") {
              request.onblocked?.(new Event("blocked"));
            } else {
              request.fail(error);
            }
          });
          return request as unknown as IDBOpenDBRequest;
        },
      },
    });
  }

  it("creates only the version-2 core schema while the media flag is off", async () => {
    const fake = new FakeIndexedDb();
    install(fake);
    const pdf = Uint8Array.from([1, 2, 3]).buffer;

    await savePdfToIndexedDB(pdf);

    expect(fake.state.version).toBe(QUICKFILL_CORE_DB_VERSION);
    expect([...fake.state.stores.keys()].sort()).toEqual(
      [QUICKFILL_PDF_STORE, QUICKFILL_TIMESTAMP_STORE].sort(),
    );
    expect(fake.state.stores.has(QUICKFILL_MEDIA_SESSION_STORE)).toBe(false);
    expect(fake.state.stores.has(QUICKFILL_MEDIA_ASSET_STORE)).toBe(false);
    expect(
      fake.state.stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.values.get(QUICKFILL_PDF_REPLACEMENT_PENDING_KEY),
    ).toBe(true);
    expect(await loadPdfFromIndexedDB()).toBe(pdf);
  });

  it("migrates version 2 to version 3 only through the media facade", async () => {
    const fake = new FakeIndexedDb(QUICKFILL_CORE_DB_VERSION);
    const pdf = Uint8Array.from([4, 5, 6]).buffer;
    fake.seedCore(pdf);
    install(fake);

    await runQuickFillMediaTransaction("readwrite", async (transaction) => {
      await transaction.put(QUICKFILL_MEDIA_SESSION_STORE, {
        key: "current_media",
      });
    });

    expect(fake.state.version).toBe(QUICKFILL_MEDIA_DB_VERSION);
    expect(fake.state.stores.has(QUICKFILL_MEDIA_SESSION_STORE)).toBe(true);
    expect(fake.state.stores.has(QUICKFILL_MEDIA_ASSET_STORE)).toBe(true);
    expect(
      fake.state.stores.get(QUICKFILL_PDF_STORE)?.values.get(
        QUICKFILL_PDF_KEY,
      ),
    ).toBe(pdf);
  });

  it("opens an existing version-3 database without downgrade or media activity while off", async () => {
    const fake = new FakeIndexedDb(QUICKFILL_MEDIA_DB_VERSION);
    const pdf = Uint8Array.from([7, 8, 9]).buffer;
    fake.seedCore(pdf);
    fake.ensureStore(QUICKFILL_MEDIA_SESSION_STORE, "key").values.set(
      "current_media",
      { key: "current_media", sentinel: true },
    );
    fake.ensureStore(QUICKFILL_MEDIA_ASSET_STORE, "resourceId").values.set(
      "sha256-sentinel",
      { resourceId: "sha256-sentinel" },
    );
    fake
      .ensureStore(QUICKFILL_TIMESTAMP_STORE)
      .values.set(QUICKFILL_MEDIA_BINDING_KEY, { sentinel: true });
    install(fake);

    expect(await loadPdfFromIndexedDB()).toBe(pdf);

    expect(fake.openVersions).toEqual([undefined]);
    expect(fake.transactionStoreSets).toEqual([
      [QUICKFILL_PDF_STORE, QUICKFILL_TIMESTAMP_STORE],
    ]);
    expect(fake.usedStores).not.toContain(QUICKFILL_MEDIA_SESSION_STORE);
    expect(fake.usedStores).not.toContain(QUICKFILL_MEDIA_ASSET_STORE);
    expect(
      fake.state.stores
        .get(QUICKFILL_MEDIA_SESSION_STORE)
        ?.values.get("current_media"),
    ).toEqual({ key: "current_media", sentinel: true });
  });

  it("atomically clears old media when a core upload saves in the exact feature-on build", async () => {
    process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA = "local-v1";
    const fake = new FakeIndexedDb(QUICKFILL_MEDIA_DB_VERSION);
    const previousPdf = Uint8Array.from([7, 8, 9]).buffer;
    const replacementPdf = Uint8Array.from([7, 8, 9]).buffer;
    fake.seedCore(previousPdf);
    fake.ensureStore(QUICKFILL_MEDIA_SESSION_STORE, "key").values.set(
      "current_media",
      { key: "current_media", sentinel: true },
    );
    fake.ensureStore(QUICKFILL_MEDIA_ASSET_STORE, "resourceId").values.set(
      "sha256-sentinel",
      { resourceId: "sha256-sentinel" },
    );
    fake
      .ensureStore(QUICKFILL_TIMESTAMP_STORE)
      .values.set(QUICKFILL_MEDIA_BINDING_KEY, { sentinel: true });
    install(fake);

    await savePdfToIndexedDB(replacementPdf);

    expect(
      fake.state.stores
        .get(QUICKFILL_PDF_STORE)
        ?.values.get(QUICKFILL_PDF_KEY),
    ).toBe(replacementPdf);
    expect(
      fake.state.stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.values.has(QUICKFILL_MEDIA_BINDING_KEY),
    ).toBe(false);
    expect(
      fake.state.stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.values.has(QUICKFILL_PDF_REPLACEMENT_PENDING_KEY),
    ).toBe(false);
    expect(
      fake.state.stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.values.size,
    ).toBe(0);
    expect(
      fake.state.stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.values.size,
    ).toBe(0);
    expect(fake.transactionStoreSets).toEqual([
      [
        QUICKFILL_PDF_STORE,
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_MEDIA_SESSION_STORE,
        QUICKFILL_MEDIA_ASSET_STORE,
      ],
    ]);
  });

  it("removes an expired core PDF without creating media stores", async () => {
    const fake = new FakeIndexedDb(QUICKFILL_CORE_DB_VERSION);
    fake.seedCore(
      Uint8Array.from([10]).buffer,
      Date.now() - QUICKFILL_MAX_SESSION_AGE_MS - 1,
    );
    install(fake);

    await cleanupOldIndexedDBSessions();

    expect(
      fake.state.stores
        .get(QUICKFILL_PDF_STORE)
        ?.values.has(QUICKFILL_PDF_KEY),
    ).toBe(false);
    expect(fake.state.stores.has(QUICKFILL_MEDIA_SESSION_STORE)).toBe(false);
  });

  it("fails closed when IndexedDB throws SecurityError", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open: () => {
          throw new DOMException("blocked by browser policy", "SecurityError");
        },
      },
    });

    await expect(loadPdfFromIndexedDB()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("fails closed without hanging when IndexedDB is unavailable or an open is blocked", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    await expect(loadPdfFromIndexedDB()).resolves.toBeNull();

    installOpenFailure("blocked");
    await expect(
      runQuickFillMediaTransaction("readonly", async () => undefined),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["AbortError", "VersionError"] as const)(
    "propagates %s open failures without starting a transaction",
    async (name) => {
      installOpenFailure(
        "error",
        new DOMException(`simulated ${name}`, name),
      );

      await expect(
        runQuickFillMediaTransaction("readonly", async () => undefined),
      ).rejects.toMatchObject({ name });
    },
  );

  it.each(["abort", "error"] as const)(
    "closes and fails closed when a transaction emits %s",
    async (failure) => {
      const fake = new FakeIndexedDb(QUICKFILL_CORE_DB_VERSION);
      fake.seedCore(Uint8Array.from([11]).buffer);
      fake.completionFailure = failure;
      install(fake);

      await expect(loadPdfFromIndexedDB()).resolves.toBeNull();
      expect(fake.closeCalls).toBe(1);
    },
  );

  it("closes and fails closed when an IndexedDB request errors", async () => {
    const fake = new FakeIndexedDb(QUICKFILL_CORE_DB_VERSION);
    fake.seedCore(Uint8Array.from([12]).buffer);
    fake.requestFailure = new DOMException(
      "simulated request failure",
      "UnknownError",
    );
    install(fake);

    await expect(loadPdfFromIndexedDB()).resolves.toBeNull();
    expect(fake.closeCalls).toBe(1);
  });

  it("closes an active connection on versionchange", async () => {
    const fake = new FakeIndexedDb(QUICKFILL_CORE_DB_VERSION);
    const pdf = Uint8Array.from([13]).buffer;
    fake.seedCore(pdf);
    fake.triggerVersionChangeOnTransaction = true;
    install(fake);

    await expect(loadPdfFromIndexedDB()).resolves.toBe(pdf);
    expect(fake.closeCalls).toBe(2);
  });
});
