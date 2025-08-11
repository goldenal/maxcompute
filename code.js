/* ======================= code.js (plugin main) =======================
This runs in the Figma plugin main environment (no DOM).
It gathers selection data, exports images as base64, and sends everything to the UI
which will forward the job to your local backend.

Save as: code.js
*/

// code.js
figma.showUI(__html__, { width: 520, height: 640 });

// Helper: serialize basic paint (fills) to a simple object
function serializePaints(paints) {
  if (!paints) return [];
  return paints.map(p => {
    if (p.type === 'SOLID') {
      return { type: 'SOLID', color: p.color, opacity: p.opacity };
    }
    // Add support for GRADIENT, IMAGE later if needed
    return { type: p.type };
  });
}

// Helper: serialize text style
function serializeTextStyle(node) {
  if (node.type !== 'TEXT') return null;
  const style = node.getRangeTextStyle(0, node.characters.length);
  return {
    fontName: style.fontName ? style.fontName : null,
    fontSize: style.fontSize,
    fontWeight: style.fontName && style.fontName.style ? style.fontName.style : null,
    lineHeight: style.lineHeight && style.lineHeight.value ? style.lineHeight.value : null,
    letterSpacing: style.letterSpacing && style.letterSpacing.value ? style.letterSpacing.value : null
  };
}

// Serialize a node recursively but only with the basic properties needed for generation
async function serializeNode(node) {
  const base = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: node.locked,
  };

  // geometry
  if ('absoluteTransform' in node) {
    base.absoluteTransform = node.absoluteTransform;
  }
  if ('x' in node) base.x = node.x;
  if ('y' in node) base.y = node.y;
  if ('width' in node) base.width = node.width;
  if ('height' in node) base.height = node.height;

  // fills & strokes
  if ('fills' in node) base.fills = serializePaints(node.fills);
  if ('strokes' in node) base.strokes = serializePaints(node.strokes);
  if ('cornerRadius' in node) base.cornerRadius = node.cornerRadius;

  // text specific
  if (node.type === 'TEXT') {
    base.characters = node.characters;
    base.textStyle = serializeTextStyle(node);
  }

  // layout / autolayout
  if ('layoutMode' in node) base.layoutMode = node.layoutMode;
  if ('primaryAxisAlign' in node) base.primaryAxisAlign = node.primaryAxisAlign;
  if ('counterAxisAlign' in node) base.counterAxisAlign = node.counterAxisAlign;
  if ('itemSpacing' in node) base.itemSpacing = node.itemSpacing;

  // exports (let consumer decide to export images)
  if ('exportSettings' in node) base.exportSettings = node.exportSettings;

  // children
  if ('children' in node && node.children.length) {
    base.children = [];
    for (const child of node.children) {
      base.children.push(await serializeNode(child));
    }
  }

  return base;
}

// Export a node (image) as PNG and convert to base64 string
async function exportNodeAsPngBase64(node, scale = 2) {
  try {
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    // convert Uint8Array to base64
    let binary = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    return null;
  }
}

// Main handler when UI requests selection serialization
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'serialize-selection') {
    try {
      const selection = figma.currentPage.selection;
      if (!selection || selection.length === 0) {
        figma.ui.postMessage({ type: 'no-selection' });
        return;
      }

      const result = {
        fileName: figma.root.name,
        pageName: figma.currentPage.name,
        selectionCount: selection.length,
        nodes: [],
        images: [],
      };

      // Serialize each selected node
      for (const node of selection) {
        const serialized = await serializeNode(node);
        result.nodes.push(serialized);
      }

      // Optionally export each selected node as PNG base64 (useful for server preview or raster fallback)
      if (msg.options && msg.options.exportImages) {
        for (const node of selection) {
          const pngData = await exportNodeAsPngBase64(node, msg.options.scale || 2);
          if (pngData) {
            result.images.push({ id: node.id, name: node.name, data: pngData });
          }
        }
      }

      // Send serialized payload to UI
      figma.ui.postMessage({ type: 'selection-serialized', payload: result });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', message: e.message });
    }
  }

  if (msg.type === 'close-plugin') {
    figma.closePlugin(msg.message || 'Closed');
  }
};

/* ======================= ui.html =======================
This is the UI shown inside Figma. It includes controls to
- serialize the selection
- send the serialized data to your local server
- receive generated Dart code and display it

Save as: ui.html
*/