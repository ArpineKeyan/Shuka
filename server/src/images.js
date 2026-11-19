// Builds image URLs from what is stored in product_images.file_path.
// Step 4 fills this in (local folder in dev, Cloudinary in production).
export function imageUrls(filePath) {
  if (!filePath) return null;
  return {
    thumb: `/api/uploads/${filePath}_thumb.webp`,
    large: `/api/uploads/${filePath}_large.webp`,
  };
}
