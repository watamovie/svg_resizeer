const fileInput = document.getElementById('svg-file');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const lockAspectCheckbox = document.getElementById('lock-aspect');
const applyButton = document.getElementById('apply-resize');
const downloadButton = document.getElementById('download-svg');
const statusText = document.getElementById('status-text');
const originalPreview = document.getElementById('original-preview');
const resizedPreview = document.getElementById('resized-preview');
const dimensionTemplate = document.getElementById('dimension-template');

let originalSvgElement = null;
let originalDimensions = null;
let originalAspectRatio = null;
let lastSerializedSvg = '';

fileInput.addEventListener('change', handleFileSelect);
applyButton.addEventListener('click', handleApplyResize);
downloadButton.addEventListener('click', handleDownload);
lockAspectCheckbox.addEventListener('change', handleAspectToggle);
widthInput.addEventListener('input', () => handleDimensionInput('width'));
heightInput.addEventListener('input', () => handleDimensionInput('height'));

function handleFileSelect(event) {
  const [file] = event.target.files;
  resetState();

  if (!file) {
    statusText.textContent = 'SVG ファイルを選択してください。';
    return;
  }

  if (!file.name.toLowerCase().endsWith('.svg')) {
    statusText.textContent = 'SVG 形式のファイルを選択してください。';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const svgText = reader.result;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const parsedSvg = doc.documentElement;

    if (!parsedSvg || parsedSvg.nodeName.toLowerCase() !== 'svg') {
      statusText.textContent = 'SVG を読み込めませんでした。ファイルを確認してください。';
      return;
    }

    originalSvgElement = parsedSvg;
    originalDimensions = extractDimensions(parsedSvg);

    if (!originalDimensions.width || !originalDimensions.height) {
      statusText.textContent = '幅または高さが取得できませんでした。viewBox の設定を確認してください。';
      originalSvgElement = null;
      originalDimensions = null;
      return;
    }

    originalAspectRatio = originalDimensions.width / originalDimensions.height;

    widthInput.value = Math.round(originalDimensions.width);
    heightInput.value = Math.round(originalDimensions.height);
    applyButton.disabled = false;
    statusText.textContent = `読み込み完了: ${formatNumber(originalDimensions.width)} × ${formatNumber(originalDimensions.height)} px`;

    renderPreview(originalPreview, parsedSvg);
  };

  reader.onerror = () => {
    statusText.textContent = 'ファイルの読み込み中にエラーが発生しました。';
  };

  reader.readAsText(file);
}

function resetState() {
  originalSvgElement = null;
  originalDimensions = null;
  originalAspectRatio = null;
  lastSerializedSvg = '';
  applyButton.disabled = true;
  downloadButton.disabled = true;
  resizedPreview.innerHTML = '';
}

function extractDimensions(svg) {
  const widthAttr = svg.getAttribute('width');
  const heightAttr = svg.getAttribute('height');
  const viewBoxAttr = svg.getAttribute('viewBox');

  const width = parseLength(widthAttr);
  const height = parseLength(heightAttr);

  let viewBox = null;
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => !Number.isNaN(value))) {
      viewBox = parts;
    }
  }

  const fallbackWidth = viewBox ? viewBox[2] : width;
  const fallbackHeight = viewBox ? viewBox[3] : height;

  return {
    width: width || fallbackWidth,
    height: height || fallbackHeight,
    viewBox,
  };
}

function parseLength(value) {
  if (!value) return null;
  if (value === '100%') return null;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function handleAspectToggle() {
  if (!originalAspectRatio) return;
  if (lockAspectCheckbox.checked) {
    const width = parseFloat(widthInput.value);
    if (Number.isFinite(width)) {
      heightInput.value = Math.round(width / originalAspectRatio);
    }
  }
}

function handleDimensionInput(changed) {
  if (!originalAspectRatio || !lockAspectCheckbox.checked) {
    return;
  }

  const width = parseFloat(widthInput.value);
  const height = parseFloat(heightInput.value);

  if (changed === 'width' && Number.isFinite(width)) {
    heightInput.value = Math.round(width / originalAspectRatio);
  }

  if (changed === 'height' && Number.isFinite(height)) {
    widthInput.value = Math.round(height * originalAspectRatio);
  }
}

function handleApplyResize() {
  if (!originalSvgElement || !originalDimensions) return;

  const width = parseFloat(widthInput.value);
  const height = parseFloat(heightInput.value);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    statusText.textContent = '幅と高さには 0 より大きい数値を入力してください。';
    return;
  }

  const { svgElement, serialized } = buildResizedSvg({ width, height });
  if (!svgElement) {
    statusText.textContent = 'SVG のリサイズに失敗しました。';
    return;
  }

  renderPreview(resizedPreview, svgElement);
  lastSerializedSvg = serialized;
  downloadButton.disabled = false;
  statusText.textContent = `リサイズ完了: ${formatNumber(width)} × ${formatNumber(height)} px`;
}

function buildResizedSvg({ width, height }) {
  const svgClone = originalSvgElement.cloneNode(true);
  svgClone.setAttribute('width', `${width}`);
  svgClone.setAttribute('height', `${height}`);

  if (!svgClone.getAttribute('viewBox')) {
    svgClone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  injectDimensionLines(svgClone, { width, height });

  const serializer = new XMLSerializer();
  const serialized = serializer.serializeToString(svgClone);
  const previewNode = svgClone.cloneNode(true);
  return { svgElement: previewNode, serialized };
}

function injectDimensionLines(svg, size) {
  const existing = svg.querySelector('#dimension-lines');
  if (existing) {
    existing.remove();
  }

  if (!dimensionTemplate?.content?.firstElementChild) return;

  const dimensionGroup = dimensionTemplate.content.firstElementChild.cloneNode(true);
  const marker = dimensionGroup.querySelector('marker');
  const uniqueId = `arrow-${Math.random().toString(36).slice(2, 8)}`;
  if (marker) {
    marker.id = uniqueId;
  }

  dimensionGroup.querySelectorAll('line').forEach((line) => {
    line.setAttribute('marker-start', `url(#${uniqueId})`);
    line.setAttribute('marker-end', `url(#${uniqueId})`);
  });

  const viewBoxAttr = svg.getAttribute('viewBox');
  let minX = 0;
  let minY = 0;
  let boxWidth = size.width;
  let boxHeight = size.height;

  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => !Number.isNaN(value))) {
      [minX, minY, boxWidth, boxHeight] = parts;
    }
  }

  const safeMargin = Math.max(Math.min(Math.min(boxWidth, boxHeight) * 0.08, 40), 12);

  const widthLine = dimensionGroup.querySelector('#width-line');
  const widthLabel = dimensionGroup.querySelector('#width-label');
  const heightLine = dimensionGroup.querySelector('#height-line');
  const heightLabel = dimensionGroup.querySelector('#height-label');

  const xStart = minX + safeMargin;
  const xEnd = minX + boxWidth - safeMargin;
  const yStart = minY + safeMargin;
  const yEnd = minY + boxHeight - safeMargin;

  if (widthLine) {
    widthLine.setAttribute('x1', xStart);
    widthLine.setAttribute('y1', yStart);
    widthLine.setAttribute('x2', xEnd);
    widthLine.setAttribute('y2', yStart);
  }

  if (widthLabel) {
    widthLabel.setAttribute('x', minX + boxWidth / 2);
    widthLabel.setAttribute('y', yStart - safeMargin * 0.4);
    widthLabel.textContent = `${formatNumber(size.width)} px`;
  }

  if (heightLine) {
    heightLine.setAttribute('x1', xEnd);
    heightLine.setAttribute('y1', yStart);
    heightLine.setAttribute('x2', xEnd);
    heightLine.setAttribute('y2', yEnd);
  }

  if (heightLabel) {
    const labelX = xEnd + safeMargin * 0.4;
    const labelY = minY + boxHeight / 2;
    heightLabel.setAttribute('x', labelX);
    heightLabel.setAttribute('y', labelY);
    heightLabel.setAttribute('transform', `rotate(-90 ${labelX} ${labelY})`);
    heightLabel.textContent = `${formatNumber(size.height)} px`;
  }

  svg.appendChild(dimensionGroup);
}

function renderPreview(container, svgElement) {
  container.innerHTML = '';
  const imported = document.importNode(svgElement, true);
  container.appendChild(imported);
}

function handleDownload() {
  if (!lastSerializedSvg) return;
  const blob = new Blob([lastSerializedSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'resized-with-dimensions.svg';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatNumber(value) {
  return Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}
