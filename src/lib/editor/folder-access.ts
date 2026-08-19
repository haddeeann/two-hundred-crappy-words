export const folderDialogOptions = {
  directory: true,
  multiple: false,
  // Tauri grants only immediate children by default. A writing project owns
  // its full tree, so nested lore and manuscript files need recursive scope.
  recursive: true,
} as const;
