import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capturePhoto,
  captureDocument,
  type DocumentPickerModule,
  type FileSystemModule,
  type ImagePickerModule
} from "../src/attachments/captureAttachment.ts";

function fakeImagePicker(overrides: Partial<ImagePickerModule> = {}): ImagePickerModule {
  return {
    requestCameraPermissionsAsync: async () => ({ status: "granted" }),
    launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: "file://photo.jpg", base64: "ZmFrZS1qcGVn", fileName: "photo.jpg", mimeType: "image/jpeg", fileSize: 9 }] }),
    ...overrides
  };
}

function fakeDocumentPicker(overrides: Partial<DocumentPickerModule> = {}): DocumentPickerModule {
  return {
    getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file://form.pdf", name: "form.pdf", mimeType: "application/pdf", size: 12 }] }),
    ...overrides
  };
}

function fakeFileSystem(overrides: Partial<FileSystemModule> = {}): FileSystemModule {
  return {
    readAsStringAsync: async () => "ZmFrZS1wZGYtY29udGVudA==",
    ...overrides
  };
}

test("capturePhoto returns the captured photo when permission is granted and a photo is taken", async () => {
  const result = await capturePhoto({ imagePickerModule: fakeImagePicker() });
  assert.deepEqual(result, { kind: "photo", fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 9, base64Content: "ZmFrZS1qcGVn" });
});

test("capturePhoto returns null without opening the camera when permission is denied", async () => {
  const result = await capturePhoto({
    imagePickerModule: fakeImagePicker({
      requestCameraPermissionsAsync: async () => ({ status: "denied" }),
      launchCameraAsync: async () => {
        throw new Error("should not open the camera without permission");
      }
    })
  });
  assert.equal(result, null);
});

test("capturePhoto returns null when the crew member cancels", async () => {
  const result = await capturePhoto({ imagePickerModule: fakeImagePicker({ launchCameraAsync: async () => ({ canceled: true }) }) });
  assert.equal(result, null);
});

test("capturePhoto falls back to a generated file name, default mime type and an estimated size when the picker doesn't report them", async () => {
  const result = await capturePhoto({
    imagePickerModule: fakeImagePicker({
      launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: "file://photo.jpg", base64: "ZmFrZQ==", fileName: null, mimeType: null, fileSize: null }] })
    })
  });
  assert.match(result?.fileName ?? "", /^photo-\d+\.jpg$/);
  assert.equal(result?.mimeType, "image/jpeg");
  assert.ok((result?.sizeBytes ?? 0) > 0);
});

test("captureDocument reads the picked file's content via the file system module", async () => {
  const result = await captureDocument({ documentPickerModule: fakeDocumentPicker(), fileSystemModule: fakeFileSystem() });
  assert.deepEqual(result, { kind: "document", fileName: "form.pdf", mimeType: "application/pdf", sizeBytes: 12, base64Content: "ZmFrZS1wZGYtY29udGVudA==" });
});

test("captureDocument returns null when the crew member cancels", async () => {
  const result = await captureDocument({
    documentPickerModule: fakeDocumentPicker({ getDocumentAsync: async () => ({ canceled: true }) }),
    fileSystemModule: fakeFileSystem()
  });
  assert.equal(result, null);
});
