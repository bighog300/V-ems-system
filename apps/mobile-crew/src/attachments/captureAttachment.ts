import type { AttachmentKind } from "../offline/db.ts";

export interface CapturedFile {
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64Content: string;
}

interface ImagePickerAsset {
  uri: string;
  base64?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface ImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ status: string }>;
  launchCameraAsync(options?: { base64?: boolean; quality?: number }): Promise<{ canceled: boolean; assets?: ImagePickerAsset[] | null }>;
}

interface DocumentPickerAsset {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

export interface DocumentPickerModule {
  getDocumentAsync(options?: { copyToCacheDirectory?: boolean }): Promise<{ canceled: boolean; assets?: DocumentPickerAsset[] | null }>;
}

export interface FileSystemModule {
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
}

// expo-image-picker, expo-document-picker and expo-file-system are native
// modules that only resolve inside the Expo/RN runtime — lazily imported
// here for the same reason every other native dependency in this app is,
// and for the same reason each accepts an injectable dependency for
// plain-Node testing.
let imagePickerModulePromise: Promise<ImagePickerModule> | null = null;
function getImagePickerModule(): Promise<ImagePickerModule> {
  if (!imagePickerModulePromise) imagePickerModulePromise = import("expo-image-picker") as unknown as Promise<ImagePickerModule>;
  return imagePickerModulePromise;
}

let documentPickerModulePromise: Promise<DocumentPickerModule> | null = null;
function getDocumentPickerModule(): Promise<DocumentPickerModule> {
  if (!documentPickerModulePromise) documentPickerModulePromise = import("expo-document-picker") as unknown as Promise<DocumentPickerModule>;
  return documentPickerModulePromise;
}

let fileSystemModulePromise: Promise<FileSystemModule> | null = null;
function getFileSystemModule(): Promise<FileSystemModule> {
  if (!fileSystemModulePromise) fileSystemModulePromise = import("expo-file-system") as unknown as Promise<FileSystemModule>;
  return fileSystemModulePromise;
}

function estimateBytesFromBase64(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Launches the camera and returns the captured photo, or null if the crew
 * member cancels or denies the permission — capture is always optional,
 * never something the rest of charting waits on. Requesting camera
 * permission directly from this action (rather than a separate
 * rationale step, unlike location) is standard, expected behavior: tapping
 * "Take photo" already states the intent the OS prompt is asking about.
 */
export async function capturePhoto(deps: { imagePickerModule?: ImagePickerModule } = {}): Promise<CapturedFile | null> {
  const imagePicker = deps.imagePickerModule ?? (await getImagePickerModule());
  const permission = await imagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") return null;

  const result = await imagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) return null;

  return {
    kind: "photo",
    fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    base64Content: asset.base64,
    sizeBytes: asset.fileSize ?? estimateBytesFromBase64(asset.base64)
  };
}

/**
 * Launches the document picker (PDFs, scanned forms, etc. — anything the
 * camera/photo-library flow isn't meant for) and returns the picked file,
 * or null if cancelled. expo-document-picker doesn't hand back file
 * content directly, only a uri, so it's read separately via
 * expo-file-system.
 */
export async function captureDocument(
  deps: { documentPickerModule?: DocumentPickerModule; fileSystemModule?: FileSystemModule } = {}
): Promise<CapturedFile | null> {
  const documentPicker = deps.documentPickerModule ?? (await getDocumentPickerModule());
  const result = await documentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;

  const fileSystem = deps.fileSystemModule ?? (await getFileSystemModule());
  const base64Content = await fileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });

  return {
    kind: "document",
    fileName: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
    base64Content,
    sizeBytes: asset.size ?? estimateBytesFromBase64(base64Content)
  };
}
