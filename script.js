const fileInput = document.getElementById('fileInput');
const svgTextInput = document.getElementById('svgTextInput');
const loadFromTextButton = document.getElementById('loadFromText');
const originalInfo = document.getElementById('originalInfo');
const originalPreview = document.getElementById('originalPreview');
const resizeSection = document.getElementById('resizeSection');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const lockRatioInput = document.getElementById('lockRatio');
const generateButton = document.getElementById('generateButton');
const resultsSection = document.getElementById('resultsSection');
const resizedPreview = document.getElementById('resizedPreview');
const downloadSvgLink = document.getElementById('downloadSvg');
const dimensionedPreview = document.getElementById('dimensionedPreview');
const downloadPngLink = document.getElementById('downloadPng');

const state = {
  originalSvgText: '',
  aspectRatio: 1,
};

let currentOriginalUrl = null;
let currentResizedUrl = null;
let isDimensionUpdating = false;

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    loadSvgText(text);
  } catch (error) {
    showError(`ファイルの読み込みに失敗しました: ${error.message}`);
  }
});

loadFromTextButton.addEventListener('click', () => {
  const text = svgTextInput.value.trim();
  if (!text) {
    showError('SVG のテキストを入力してください。');
    return;
  }

  loadSvgText(text);
});

widthInput.addEventListener('input', () => handleDimensionInput('width'));
heightInput.addEventListener('input', () => handleDimensionInput('height'));
lockRatioInput.addEventListener('change', () => {
  if (!lockRatioInput.checked) {
    return;
  }

  const widthValue = parseFloat(widthInput.value);
  const heightValue = parseFloat(heightInput.value);
  if (isFinite(widthValue) && isFinite(heightValue) && heightValue !== 0) {
    state.aspectRatio = widthValue / heightValue;
  }

  // sync the other dimension immediately to maintain ratio
  handleDimensionInput('width');
});

generateButton.addEventListener('click', async () => {
  if (!state.originalSvgText) {
    showError('先に SVG を読み込んでください。');
    return;
  }

  const width = parseFloat(widthInput.value);
  const height = parseFloat(heightInput.value);

  if (!isFinite(width) || width <= 0) {
    showError('幅には 0 より大きい数値を指定してください。');
    return;
  }

  if (!isFinite(height) || height <= 0) {
    showError('高さには 0 より大きい数値を指定してください。');
    return;
  }

  try {
    generateButton.disabled = true;
    generateButton.textContent = '生成中...';

    state.aspectRatio = width / height;

    const resizedSvgText = createResizedSvgText(state.originalSvgText, width, height);
    showResizedSvg(resizedSvgText);

    const pngDataUrl = await createDimensionedPng(resizedSvgText, width, height);
    showDimensionedPreview(pngDataUrl);

    resultsSection.hidden = false;
  } catch (error) {
    showError(`生成中にエラーが発生しました: ${error.message}`);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = 'リサイズ & 寸法線を生成';
  }
});

function loadSvgText(text) {
  try {
    const { width, height } = parseSvgDimensions(text);
    state.originalSvgText = text;
    state.aspectRatio = width / height;

    widthInput.value = formatDimension(width);
    heightInput.value = formatDimension(height);

    resizeSection.hidden = false;
    resultsSection.hidden = true;

    updateOriginalInfo(width, height);
    showOriginalPreview(text);
  } catch (error) {
    showError(`SVG の解析に失敗しました: ${error.message}`);
  }
}

function parseSvgDimensions(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('SVG ルート要素が見つかりません。');
  }

  const widthAttr = svgElement.getAttribute('width');
  const heightAttr = svgElement.getAttribute('height');
  const viewBoxAttr = svgElement.getAttribute('viewBox');

  let width = parseLength(widthAttr);
  let height = parseLength(heightAttr);

  if ((!isFinite(width) || !isFinite(height)) && viewBoxAttr) {
    const parts = viewBoxAttr
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => isFinite(value));
    if (parts.length === 4) {
      width = isFinite(width) ? width : parts[2];
      height = isFinite(height) ? height : parts[3];
    }
  }

  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('幅または高さを特定できませんでした。幅・高さ、もしくは viewBox を設定してください。');
  }

  return { width, height };
}

function parseLength(value) {
  if (!value) {
    return NaN;
  }
  const match = String(value).match(/-?\d*\.?\d+/);
  return match ? parseFloat(match[0]) : NaN;
}

function handleDimensionInput(changed) {
  if (!state.aspectRatio || isDimensionUpdating) {
    return;
  }

  const widthValue = parseFloat(widthInput.value);
  const heightValue = parseFloat(heightInput.value);

  isDimensionUpdating = true;

  if (lockRatioInput.checked) {
    if (changed === 'width' && isFinite(widthValue) && widthValue > 0) {
      const newHeight = widthValue / state.aspectRatio;
      heightInput.value = formatDimension(newHeight);
    } else if (changed === 'height' && isFinite(heightValue) && heightValue > 0) {
      const newWidth = heightValue * state.aspectRatio;
      widthInput.value = formatDimension(newWidth);
    }
  }

  isDimensionUpdating = false;
}

function updateOriginalInfo(width, height) {
  const ratio = width / height;
  originalInfo.textContent = `元のサイズ: 幅 ${formatDimension(width)} px × 高さ ${formatDimension(height)} px (アスペクト比 ${formatDimension(ratio)})`;
}

function showOriginalPreview(svgText) {
  if (currentOriginalUrl) {
    URL.revokeObjectURL(currentOriginalUrl);
  }
  currentOriginalUrl = createSvgObjectUrl(svgText);
  originalPreview.innerHTML = '';
  const objectElement = document.createElement('object');
  objectElement.type = 'image/svg+xml';
  objectElement.data = currentOriginalUrl;
  objectElement.setAttribute('aria-label', '元の SVG プレビュー');
  originalPreview.appendChild(objectElement);
}

function createResizedSvgText(svgText, width, height) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('SVG ルート要素が見つかりません。');
  }

  const formattedWidth = formatDimension(width);
  const formattedHeight = formatDimension(height);

  svgElement.setAttribute('width', formattedWidth);
  svgElement.setAttribute('height', formattedHeight);

  if (!svgElement.hasAttribute('viewBox')) {
    svgElement.setAttribute('viewBox', `0 0 ${formattedWidth} ${formattedHeight}`);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
}

function showResizedSvg(svgText) {
  if (currentResizedUrl) {
    URL.revokeObjectURL(currentResizedUrl);
  }
  currentResizedUrl = createSvgObjectUrl(svgText);

  resizedPreview.innerHTML = '';
  const objectElement = document.createElement('object');
  objectElement.type = 'image/svg+xml';
  objectElement.data = currentResizedUrl;
  objectElement.setAttribute('aria-label', 'リサイズした SVG プレビュー');
  resizedPreview.appendChild(objectElement);

  downloadSvgLink.href = currentResizedUrl;
}

function createSvgObjectUrl(svgText) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}

async function createDimensionedPng(svgText, width, height) {
  const canvas = document.createElement('canvas');
  const margin = 80;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  canvas.width = Math.ceil(safeWidth + margin * 2);
  canvas.height = Math.ceil(safeHeight + margin * 2);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await loadSvgAsImage(svgText);
  ctx.drawImage(img, margin, margin, safeWidth, safeHeight);

  drawDimensionGraphics(ctx, {
    x: margin,
    y: margin,
    width: safeWidth,
    height: safeHeight,
    labelWidth: width,
    labelHeight: height,
  });

  return canvas.toDataURL('image/png');
}

function drawDimensionGraphics(ctx, rect) {
  const arrowSize = 10;
  const extension = 24;
  const fontSize = 20;

  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';

  const horizontalY = rect.y + rect.height + extension;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.height);
  ctx.lineTo(rect.x, horizontalY);
  ctx.moveTo(rect.x + rect.width, rect.y + rect.height);
  ctx.lineTo(rect.x + rect.width, horizontalY);
  ctx.stroke();

  drawArrowLine(ctx, rect.x, horizontalY, rect.x + rect.width, horizontalY, arrowSize);

  ctx.font = `${fontSize}px "Noto Sans JP", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${formatDimension(rect.labelWidth ?? rect.width)} px`, rect.x + rect.width / 2, horizontalY - 8);

  const verticalX = rect.x + rect.width + extension;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.width, rect.y);
  ctx.lineTo(verticalX, rect.y);
  ctx.moveTo(rect.x + rect.width, rect.y + rect.height);
  ctx.lineTo(verticalX, rect.y + rect.height);
  ctx.stroke();

  drawArrowLine(ctx, verticalX, rect.y, verticalX, rect.y + rect.height, arrowSize);

  ctx.save();
  ctx.translate(verticalX + fontSize, rect.y + rect.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${formatDimension(rect.labelHeight ?? rect.height)} px`, 0, -8);
  ctx.restore();

  ctx.restore();
}

function drawArrowLine(ctx, x1, y1, x2, y2, arrowSize) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  drawArrowHead(ctx, x1, y1, Math.atan2(y2 - y1, x2 - x1) + Math.PI, arrowSize);
  drawArrowHead(ctx, x2, y2, Math.atan2(y2 - y1, x2 - x1), arrowSize);
}

function drawArrowHead(ctx, x, y, angle, size) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function showDimensionedPreview(dataUrl) {
  dimensionedPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '寸法線付き PNG プレビュー';
  dimensionedPreview.appendChild(img);

  downloadPngLink.href = dataUrl;
}

async function loadSvgAsImage(svgText) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('SVG を画像として読み込めませんでした。'));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatDimension(value) {
  if (!isFinite(value)) {
    return '';
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  const fixed = rounded.toFixed(2);
  const trimmed = fixed.replace(/\.?(0)+$/, '');
  return trimmed.length > 0 ? trimmed : '0';
}

function showError(message) {
  originalInfo.textContent = message;
  originalPreview.innerHTML = '';
  resizeSection.hidden = true;
  resultsSection.hidden = true;
  state.originalSvgText = '';
  state.aspectRatio = 1;
}

window.addEventListener('beforeunload', () => {
  if (currentOriginalUrl) {
    URL.revokeObjectURL(currentOriginalUrl);
  }
  if (currentResizedUrl) {
    URL.revokeObjectURL(currentResizedUrl);
  }
});
