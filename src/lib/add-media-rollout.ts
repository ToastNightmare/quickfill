export type AddMediaRolloutMode = "off" | "local-v1";

export function addMediaRolloutModeFromFlag(
  flag: string | undefined | null,
): AddMediaRolloutMode {
  return flag === "local-v1" ? "local-v1" : "off";
}

export function isAddMediaEnabled(
  flag: string | undefined | null = process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA,
): boolean {
  return addMediaRolloutModeFromFlag(flag) === "local-v1";
}
