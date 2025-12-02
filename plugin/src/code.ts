figma.showUI(__html__, { width: 400, height: 600 });

// --- Interfaces ---

interface SerializedNode {
    id: string;
    name: string;
    type: string;
    children?: SerializedNode[];
    layout?: LayoutProps;
    style?: StyleProps;
    text?: TextProps;
    metadata?: NodeMetadata;
    semanticHints?: SemanticHints;
    visualContext?: VisualContext;
}

interface NodeMetadata {
    isComponent: boolean;
    componentName?: string;
    variantProperties?: Record<string, string>;
    mainComponentId?: string;
    depth: number;
    siblingIndex: number;
    totalSiblings: number;
}

interface SemanticHints {
    likelyRole?: 'button' | 'input' | 'card' | 'list' | 'header' | 'avatar' | 'icon' | 'divider' | 'badge' | 'container' | 'text' | 'image';
    isInteractive?: boolean;
    isDecorative?: boolean;
    confidence?: number;
}

interface VisualContext {
    visualWeight: number;
    hasBackground: boolean;
    hasBorder: boolean;
    hasShadow: boolean;
    isOverlapping?: boolean;
}

interface LayoutProps {
    width: number;
    height: number;
    x: number;
    y: number;
    rotation?: number;
    layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
    primaryAxisSizingMode?: "FIXED" | "AUTO";
    counterAxisSizingMode?: "FIXED" | "AUTO";
    primaryAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
    counterAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "BASELINE";
    padding?: { top: number; right: number; bottom: number; left: number };
    itemSpacing?: number;
    constraints?: Constraints;
    layoutGrow?: number;
    layoutAlign?: "MIN" | "MAX" | "CENTER" | "STRETCH" | "INHERIT";
    layoutWrap?: "NO_WRAP" | "WRAP";
    layoutPositioning?: "AUTO" | "ABSOLUTE";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
}

interface StyleProps {
    fills?: any[];
    strokes?: any[];
    strokeWeight?: number;
    strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
    effects?: any[];
    opacity?: number;
    blendMode?: BlendMode;
    cornerRadius?: number | { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
    clipsContent?: boolean;
    isMask?: boolean;
}

interface TextProps {
    characters: string;
    fontSize: number;
    fontName: FontName;
    fontWeight: number;
    textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
    textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";
    lineHeight?: LineHeight;
    letterSpacing?: LetterSpacing;
    textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
    textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
    paragraphSpacing?: number;
    paragraphIndent?: number;
    styledSegments?: TextSegment[];
}

interface TextSegment {
    characters: string;
    start: number;
    end: number;
    fontSize: number;
    fontName: FontName;
    fontWeight: number;
    fills?: any[];
}

// --- Semantic Analysis ---

function analyzeSemanticRole(node: SceneNode, depth: number): SemanticHints {
    const name = node.name.toLowerCase();
    const hints: SemanticHints = { confidence: 0 };

    // Button detection
    if (name.includes('button') || name.includes('btn') || name.includes('cta')) {
        hints.likelyRole = 'button';
        hints.isInteractive = true;
        hints.confidence = 0.9;
    }
    // Input detection
    else if (name.includes('input') || name.includes('textfield') || name.includes('field')) {
        hints.likelyRole = 'input';
        hints.isInteractive = true;
        hints.confidence = 0.9;
    }
    // Card detection
    else if (name.includes('card')) {
        hints.likelyRole = 'card';
        hints.confidence = 0.85;
    }
    // Header detection
    else if (name.includes('header') || name.includes('navbar') || name.includes('appbar')) {
        hints.likelyRole = 'header';
        hints.confidence = 0.85;
    }
    // Avatar detection
    else if (name.includes('avatar') || name.includes('profile')) {
        hints.likelyRole = 'avatar';
        hints.confidence = 0.8;
    }
    // Icon detection
    else if (name.includes('icon') || (node.width === node.height && node.width <= 48)) {
        hints.likelyRole = 'icon';
        hints.confidence = 0.7;
    }
    // Divider detection
    else if (name.includes('divider') || name.includes('separator') ||
        (node.height <= 2 && node.width > 50) || (node.width <= 2 && node.height > 50)) {
        hints.likelyRole = 'divider';
        hints.isDecorative = true;
        hints.confidence = 0.8;
    }
    // Badge detection
    else if (name.includes('badge') || name.includes('tag') || name.includes('chip')) {
        hints.likelyRole = 'badge';
        hints.confidence = 0.8;
    }

    // Interactive detection based on properties
    if ('reactions' in node && node.reactions.length > 0) {
        hints.isInteractive = true;
    }

    // Decorative detection
    if ('opacity' in node && node.opacity < 0.1) {
        hints.isDecorative = true;
    }

    if (name.includes('bg') || name.includes('background') || name.includes('overlay')) {
        hints.isDecorative = true;
    }

    return hints;
}

function calculateVisualContext(node: SceneNode): VisualContext {
    const context: VisualContext = {
        visualWeight: 1,
        hasBackground: false,
        hasBorder: false,
        hasShadow: false,
    };

    // Calculate visual weight (based on size and opacity)
    const area = node.width * node.height;
    context.visualWeight = Math.log(area + 1) / 10;

    if ('opacity' in node) {
        context.visualWeight *= node.opacity;
    }

    // Check for background
    if ('fills' in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
        context.hasBackground = node.fills.length > 0 && node.fills.some(f => f.visible !== false);
    }

    // Check for border
    if ('strokes' in node && node.strokes !== figma.mixed && Array.isArray(node.strokes)) {
        context.hasBorder = node.strokes.length > 0;
    }

    // Check for shadow
    if ('effects' in node && node.effects !== figma.mixed && Array.isArray(node.effects)) {
        context.hasShadow = node.effects.some(e =>
            (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible
        );
    }

    return context;
}

// --- Serialization Logic ---

// Removed custom uint8ArrayToBase64 in favor of figma.base64Encode

const pendingUploads = new Map<string, (filename: string | null) => void>();

function uploadImage(id: string, name: string, data: string): Promise<string | null> {
    return new Promise((resolve) => {
        pendingUploads.set(id, resolve);
        figma.ui.postMessage({ type: 'upload-req', id, name, data });
    });
}

async function serializeNode(
    node: SceneNode,
    assets: Record<string, any>,
    depth: number = 0,
    siblingIndex: number = 0,
    totalSiblings: number = 1
): Promise<SerializedNode> {
    const serialized: SerializedNode = {
        id: node.id,
        name: node.name,
        type: node.type,
    };

    // Root Node Context Image
    if (depth === 0) {
        try {
            figma.ui.postMessage({ type: 'log-to-server', message: `[Context] Exporting root node "${node.name}"...`, logType: 'info' });

            // Export at 1.5x
            const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1.5 } });
            const base64 = figma.base64Encode(bytes);
            const safeName = `context_${node.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

            figma.ui.postMessage({ type: 'log-to-server', message: `[Context] Uploading ${base64.length} chars...`, logType: 'info' });

            const filename = await uploadImage(node.id + '_context', safeName, base64);

            if (filename) {
                (serialized as any).contextImageFilename = filename;
                figma.ui.postMessage({ type: 'log-to-server', message: `[Context] Upload complete: ${filename}`, logType: 'info' });
            } else {
                figma.ui.postMessage({ type: 'log-to-server', message: `[Context] Upload returned null`, logType: 'error' });
            }
        } catch (err: any) {
            figma.ui.postMessage({ type: 'log-to-server', message: `[Context] Export failed: ${err.message}`, logType: 'error' });
        }
    }

    // Metadata
    serialized.metadata = {
        isComponent: node.type === 'INSTANCE' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET',
        depth,
        siblingIndex,
        totalSiblings,
    };

    if (node.type === 'INSTANCE') {
        const instance = node as InstanceNode;
        serialized.metadata.mainComponentId = instance.mainComponent?.id;
        serialized.metadata.componentName = instance.mainComponent?.name;
    }

    // Semantic hints
    serialized.semanticHints = analyzeSemanticRole(node, depth);

    // Visual context
    serialized.visualContext = calculateVisualContext(node);

    // Layout
    serialized.layout = extractLayout(node);

    // Style
    serialized.style = extractStyle(node);

    // Text with styled segments
    if (node.type === "TEXT") {
        serialized.text = await extractText(node);
    }

    // Image Export
    if ('fills' in node) {
        const fills = node.fills;
        if (Array.isArray(fills)) {
            const hasImage = fills.some(fill => fill.type === 'IMAGE');
            if (hasImage) {
                try {
                    console.log(`[Asset] Found image in node: "${node.name}"`);
                    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
                    const base64 = figma.base64Encode(bytes);
                    const safeName = node.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

                    console.log(`[Asset] Uploading ${safeName}...`);
                    const filename = await uploadImage(node.id, safeName, base64);

                    if (filename) {
                        assets[node.id] = {
                            id: node.id,
                            name: safeName,
                            filename: filename
                        };
                        console.log(`[Asset] Upload complete: ${filename}`);
                    } else {
                        console.error(`[Asset] Upload failed for ${safeName}`);
                    }
                } catch (err) {
                    console.error(`[Asset] Failed to export node "${node.name}":`, err);
                }
            }
        }
    }

    // Children
    if ("children" in node) {
        const childCount = node.children.length;
        serialized.children = await Promise.all(
            node.children.map((child, idx) =>
                serializeNode(child, assets, depth + 1, idx, childCount)
            )
        );
    }

    return serialized;
}

function extractLayout(node: SceneNode): LayoutProps {
    const layout: LayoutProps = {
        width: node.width,
        height: node.height,
        x: node.x,
        y: node.y,
    };

    // Rotation
    if ("rotation" in node && node.rotation !== 0) {
        layout.rotation = node.rotation;
    }

    // Auto Layout properties
    if ("layoutMode" in node) {
        layout.layoutMode = node.layoutMode;
        layout.primaryAxisSizingMode = node.primaryAxisSizingMode;
        layout.counterAxisSizingMode = node.counterAxisSizingMode;
        layout.primaryAxisAlignItems = node.primaryAxisAlignItems;
        layout.counterAxisAlignItems = node.counterAxisAlignItems;
        layout.itemSpacing = node.itemSpacing;
        layout.padding = {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
        };

        // Layout wrap (if available)
        if ("layoutWrap" in node) {
            layout.layoutWrap = node.layoutWrap;
        }
    }

    // Positioning
    if ("layoutPositioning" in node) {
        layout.layoutPositioning = node.layoutPositioning;
    }

    if ("layoutGrow" in node) layout.layoutGrow = node.layoutGrow;
    if ("layoutAlign" in node) layout.layoutAlign = node.layoutAlign;
    if ("constraints" in node) layout.constraints = node.constraints;

    // Min/Max dimensions
    if ("minWidth" in node) layout.minWidth = node.minWidth;
    if ("maxWidth" in node) layout.maxWidth = node.maxWidth;
    if ("minHeight" in node) layout.minHeight = node.minHeight;
    if ("maxHeight" in node) layout.maxHeight = node.maxHeight;

    return layout;
}

function extractStyle(node: SceneNode): StyleProps {
    const style: StyleProps = {};

    if ("fills" in node && node.fills !== figma.mixed) {
        style.fills = node.fills.map(serializePaint);
    }
    if ("strokes" in node && node.strokes !== figma.mixed) {
        style.strokes = node.strokes.map(serializePaint);
    }
    if ("strokeWeight" in node && node.strokeWeight !== figma.mixed) {
        style.strokeWeight = node.strokeWeight;
    }
    if ("strokeAlign" in node) {
        style.strokeAlign = node.strokeAlign;
    }
    if ("effects" in node && node.effects !== figma.mixed) {
        style.effects = node.effects.map(serializeEffect);
    }
    if ("opacity" in node) {
        style.opacity = node.opacity;
    }
    if ("blendMode" in node) {
        style.blendMode = node.blendMode;
    }
    if ("isMask" in node) {
        style.isMask = node.isMask;
    }

    // Corner Radius - Enhanced handling
    if ("cornerRadius" in node && node.cornerRadius !== figma.mixed) {
        style.cornerRadius = node.cornerRadius;
    } else if ("topLeftRadius" in node) {
        const tl = node.topLeftRadius;
        const tr = node.topRightRadius;
        const bl = node.bottomLeftRadius;
        const br = node.bottomRightRadius;

        // Only create object if corners differ
        if (tl === tr && tr === bl && bl === br) {
            style.cornerRadius = tl;
        } else {
            style.cornerRadius = {
                topLeft: tl,
                topRight: tr,
                bottomLeft: bl,
                bottomRight: br,
            };
        }
    }

    if ("clipsContent" in node) style.clipsContent = node.clipsContent;

    return style;
}

async function extractText(node: TextNode): Promise<TextProps> {
    const textProps: TextProps = {
        characters: node.characters,
        fontSize: node.fontSize !== figma.mixed ? node.fontSize : 14,
        fontName: node.fontName !== figma.mixed ? node.fontName : { family: "Inter", style: "Regular" },
        fontWeight: node.fontWeight !== figma.mixed ? node.fontWeight : 400,
        textDecoration: node.textDecoration !== figma.mixed ? node.textDecoration : "NONE",
        textCase: node.textCase !== figma.mixed ? node.textCase : "ORIGINAL",
        lineHeight: node.lineHeight !== figma.mixed ? node.lineHeight : { unit: "AUTO" },
        letterSpacing: node.letterSpacing !== figma.mixed ? node.letterSpacing : { unit: "PIXELS", value: 0 },
        textAlignHorizontal: node.textAlignHorizontal,
        textAlignVertical: node.textAlignVertical,
    };

    // Paragraph spacing
    if ("paragraphSpacing" in node && node.paragraphSpacing !== figma.mixed) {
        textProps.paragraphSpacing = node.paragraphSpacing;
    }
    if ("paragraphIndent" in node && node.paragraphIndent !== figma.mixed) {
        textProps.paragraphIndent = node.paragraphIndent;
    }

    // Extract styled text segments
    const segments: TextSegment[] = [];
    const length = node.characters.length;

    if (length > 0) {
        try {
            let currentPos = 0;
            while (currentPos < length) {
                const endPos = Math.min(currentPos + 1, length);

                const fontSize = node.getRangeFontSize(currentPos, endPos);
                const fontName = node.getRangeFontName(currentPos, endPos);
                const fontWeight = node.getRangeFontWeight(currentPos, endPos);
                const fills = node.getRangeFills(currentPos, endPos);

                // Find extent of this style
                let styleEnd = currentPos + 1;
                for (let i = currentPos + 1; i < length; i++) {
                    const nextFontSize = node.getRangeFontSize(i, i + 1);
                    const nextFontName = node.getRangeFontName(i, i + 1);
                    const nextFontWeight = node.getRangeFontWeight(i, i + 1);

                    if (fontSize === nextFontSize &&
                        fontName !== figma.mixed && nextFontName !== figma.mixed &&
                        JSON.stringify(fontName) === JSON.stringify(nextFontName) &&
                        fontWeight === nextFontWeight) {
                        styleEnd = i + 1;
                    } else {
                        break;
                    }
                }

                if (fontSize !== figma.mixed && fontName !== figma.mixed && fontWeight !== figma.mixed) {
                    segments.push({
                        characters: node.characters.substring(currentPos, styleEnd),
                        start: currentPos,
                        end: styleEnd,
                        fontSize: fontSize as number,
                        fontName: fontName as FontName,
                        fontWeight: fontWeight as number,
                        fills: fills !== figma.mixed ? (fills as Paint[]).map(serializePaint) : undefined,
                    });
                }

                currentPos = styleEnd;
            }
        } catch (err) {
            console.log("Could not extract text segments:", err);
        }
    }

    if (segments.length > 1) {
        textProps.styledSegments = segments;
    }

    return textProps;
}

function serializePaint(paint: Paint): any {
    if (paint.type === "SOLID") {
        return {
            type: "SOLID",
            color: paint.color,
            opacity: paint.opacity ?? 1,
            visible: paint.visible ?? true
        };
    } else if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_ANGULAR" || paint.type === "GRADIENT_DIAMOND") {
        return {
            type: paint.type,
            gradientStops: paint.gradientStops,
            gradientTransform: paint.gradientTransform,
            opacity: paint.opacity ?? 1,
            visible: paint.visible ?? true
        };
    } else if (paint.type === "IMAGE") {
        return {
            type: "IMAGE",
            opacity: paint.opacity ?? 1,
            scaleMode: paint.scaleMode,
            visible: paint.visible ?? true
        };
    }
    return null;
}

function serializeEffect(effect: Effect): any {
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        return {
            type: effect.type,
            color: effect.color,
            offset: effect.offset,
            radius: effect.radius,
            spread: effect.spread ?? 0,
            visible: effect.visible,
            blendMode: effect.blendMode,
        };
    } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        return {
            type: effect.type,
            radius: effect.radius,
            visible: effect.visible
        };
    }
    return null;
}

// --- Message Handling ---

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'upload-resp') {
        const resolve = pendingUploads.get(msg.id);
        if (resolve) {
            resolve(msg.error ? null : msg.filename);
            pendingUploads.delete(msg.id);
        }
        return;
    }

    if (msg.type === 'convert-selection') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.ui.postMessage({ type: 'error', message: 'Please select a node to convert.' });
            return;
        }

        try {
            const assets: Record<string, any> = {};
            const serialized = await serializeNode(selection[0], assets, 0, 0, 1);
            const contextImage = (serialized as any).contextImageFilename;

            figma.ui.postMessage({
                type: 'selection-data',
                data: serialized,
                assets: assets,
                contextImage: contextImage,
                saveToFile: msg.saveToFile
            });
        } catch (err) {
            console.error(err);
            figma.ui.postMessage({ type: 'error', message: 'Failed to process selection. Check console.' });
        }
    }
};