import { useOpenWorkordersStore, useUploadProgressStore } from "../../../stores";
import { compressImage } from "../../../utils";
import { dbUploadWorkorderMedia } from "../../../db_calls_wrapper";

export async function uploadWorkorderMedia(workorderID, files, zSettings) {
  const total = files.length;
  let completed = 0;
  let failed = 0;
  useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
  const storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
  for (let i = 0; i < files.length; i++) {
    let fileToUpload = files[i];
    const originalFilename = fileToUpload.name;
    const originalFileSize = fileToUpload.size;
    const ext = fileToUpload.name.split(".").pop() || "jpg";
    const rand = Math.floor(1000 + Math.random() * 9000);
    const typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
    const cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
    if (fileToUpload.type.startsWith("image")) {
      const compressed = await compressImage(fileToUpload, 1024, 0.65);
      if (compressed) {
        compressed.name = cleanName;
        fileToUpload = compressed;
      } else {
        fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
      }
    } else {
      fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
    }
    const result = await dbUploadWorkorderMedia(workorderID, fileToUpload, {
      originalFilename,
      originalFileSize,
    });
    if (result.success) {
      const fresh = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID);
      const currentMedia = fresh?.media || [];
      useOpenWorkordersStore.getState().setField("media", [...currentMedia, result.mediaItem], workorderID);
      completed++;
    } else {
      failed++;
    }
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
  }
  useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
  setTimeout(
    () => useUploadProgressStore.getState().setProgress(null),
    failed > 0 ? 5000 : 3000
  );
}
