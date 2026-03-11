import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Progress {
    checkpoint: bigint;
    completed: boolean;
}
export interface backendInterface {
    completeCourse(): Promise<void>;
    getProgress(): Promise<Progress>;
    resetProgress(): Promise<void>;
    saveProgress(checkpoint: bigint): Promise<void>;
}
