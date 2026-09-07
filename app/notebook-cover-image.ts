/** Re-encode uploads so neither full camera images nor active formats enter backups. */
export async function prepareNotebookCoverImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Ảnh tối đa 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('Không đọc được ảnh.');
    const encode = (maxSide: number, maxLength: number) => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Không thể xử lý ảnh.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [.82, .65, .45, .25]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= maxLength) return data;
      }
      throw new Error('Ảnh quá nhiều chi tiết. Vui lòng chọn ảnh nhỏ hơn.');
    };
    return { image: encode(768, 180000), thumbnail: encode(192, 30000) };
  } finally { bitmap.close(); }
}
