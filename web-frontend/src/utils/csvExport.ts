export const saveCSVWithDialog = async (content: string, defaultFilename: string): Promise<boolean> => {
  try {
    // Use browser download method for both development and Tauri builds
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    // Try multiple click methods for better compatibility
    try {
      a.click();
    } catch (e) {
      console.log('Standard click failed, trying event dispatch');
      const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      a.dispatchEvent(event);
    }
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    console.log('CSV downloaded successfully');
    return true;
  } catch (error) {
    console.error('Failed to save CSV:', error);
    return false;
  }
};
