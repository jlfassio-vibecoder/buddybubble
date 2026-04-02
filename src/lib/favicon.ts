
export const setFaviconBadge = (count: number) => {
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement || document.createElement('link');
  favicon.rel = 'icon';
  
  if (count === 0) {
    // Default favicon (could be a static asset if available)
    // For now, let's just use a simple circle if no count
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#4f46e5'; // indigo-600
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add a small white dot or something to make it look like an app icon
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(16, 16, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
    favicon.href = canvas.toDataURL('image/png');
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Draw base icon
      ctx.fillStyle = '#4f46e5'; // indigo-600
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(16, 16, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Draw badge
      ctx.fillStyle = '#ef4444'; // red-500
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw count text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayCount = count > 9 ? '9+' : count.toString();
      ctx.fillText(displayCount, 24, 8);
    }
    favicon.href = canvas.toDataURL('image/png');
  }
  
  if (!document.head.contains(favicon)) {
    document.head.appendChild(favicon);
  }
};
