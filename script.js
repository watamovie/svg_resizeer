const svgFileInput = document.getElementById('svgFile');
const svgSourceTextarea = document.getElementById('svgSource');
const loadButton = document.getElementById('loadSvg');
const controlsSection = document.getElementById('controls');
const previewSection = document.getElementById('preview');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const lockRatioCheckbox = document.getElementById('lockRatio');
const applyButton = document.getElementById('applySize');
const resizedPreview = document.getElementById('resizedPreview');
const dimensionedPreview = document.getElementById('dimensionedPreview');
const downloadResizedButton = document.getElementById('downloadResized');
const downloadDimensionedButton = document.getElementById('downloadDimensioned');

const SVG_NS = 'http://www.w3.org/2000/svg';

let originalSvgElement = null;
let originalViewBox = null;
let originalWidth = null;
let originalHeight = null;
let aspectRatio = 1;
let resizedSvgText = '';
let dimensionedSvgText = '';
let currentResizedUrl = null;
let currentDimensionedUrl = null;
let namespaceAttributes = [];

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function parseSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) {
    throw new Error('SVG タグが見つかりませんでした。');
  }

  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', SVG_NS);
  }

  namespaceAttributes = Array.from(svg.attributes).filter((attr) => attr.name.startsWith('xmlns:'));

  const { width, height, viewBox } = extractDimensions(svg);
  return { svgElement: svg, width, height, viewBox };
}

function extractDimensions(svg) {
  const widthAttr = svg.getAttribute('width');
  const heightAttr = svg.getAttribute('height');
  const viewBoxAttr = svg.getAttribute('viewBox');

  let width = widthAttr ? parseFloat(widthAttr) : NaN;
  let height = heightAttr ? parseFloat(heightAttr) : NaN;
  let viewBox = null;

  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/\s+|,/).map(Number);
    if (parts.length >= 4 && parts.every((num) => Number.isFinite(num))) {
      viewBox = {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  if (!viewBox) {
    if (Number.isFinite(width) && Number.isFinite(height)) {
      viewBox = { minX: 0, minY: 0, width, height };
    } else {
      width = Number.isFinite(width) ? width : 1000;
      height = Number.isFinite(height) ? height : 1000;
      viewBox = { minX: 0, minY: 0, width, height };
    }
    svg.setAttribute('viewBox', `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
  }

  if (!Number.isFinite(width) && viewBox) {
    width = viewBox.width;
    svg.setAttribute('width', width);
  }

  if (!Number.isFinite(height) && viewBox) {
    height = viewBox.height;
    svg.setAttribute('height', height);
  }

  return { width, height, viewBox };
}

function updateAspectRatio() {
  if (originalWidth && originalHeight) {
    aspectRatio = originalWidth / originalHeight;
  } else if (originalViewBox) {
    aspectRatio = originalViewBox.width / originalViewBox.height;
  } else {
    aspectRatio = 1;
  }
}

function formatNumber(value) {
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

function createResizedSvgText(width, height) {
  const clone = originalSvgElement.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  applyNamespaceAttributes(clone);
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  if (originalViewBox) {
    clone.setAttribute('viewBox', `${originalViewBox.minX} ${originalViewBox.minY} ${originalViewBox.width} ${originalViewBox.height}`);
  }
  return new XMLSerializer().serializeToString(clone);
}

function cloneContentInto(svgTarget, rootSvg = null) {
  const contentClone = originalSvgElement.cloneNode(true);
  contentClone.removeAttribute('width');
  contentClone.removeAttribute('height');
  contentClone.removeAttribute('viewBox');
  // Move child nodes
  Array.from(contentClone.childNodes).forEach((node) => {
    if (
      rootSvg &&
      node.nodeType === Node.ELEMENT_NODE &&
      node.nodeName.toLowerCase() === 'defs'
    ) {
      rootSvg.insertBefore(node, rootSvg.firstChild);
    } else {
      svgTarget.appendChild(node);
    }
  });
  // Copy attributes that affect styling
  Array.from(originalSvgElement.attributes).forEach((attr) => {
    if (!['width', 'height', 'viewBox'].includes(attr.name) && !attr.name.startsWith('xmlns')) {
      svgTarget.setAttribute(attr.name, attr.value);
    }
  });
}

function createDimensionedSvgText(width, height) {
  const baseWidth = originalViewBox.width;
  const baseHeight = originalViewBox.height;
  const baseSize = Math.max(baseWidth, baseHeight) || Math.max(width, height) || 100;
  const margin = Math.max(baseSize * 0.15, 20);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  applyNamespaceAttributes(svg);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `${originalViewBox.minX - margin} ${originalViewBox.minY - margin} ${baseWidth + margin * 2} ${baseHeight + margin * 2}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const contentGroup = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(contentGroup);
  cloneContentInto(contentGroup, svg);

  const defs = document.createElementNS(SVG_NS, 'defs');
  const startMarkerId = `dim-arrow-start-${Math.random().toString(36).slice(2, 10)}`;
  const endMarkerId = `dim-arrow-end-${Math.random().toString(36).slice(2, 10)}`;

  const markerStart = document.createElementNS(SVG_NS, 'marker');
  markerStart.setAttribute('id', startMarkerId);
  markerStart.setAttribute('markerWidth', '6');
  markerStart.setAttribute('markerHeight', '6');
  markerStart.setAttribute('refX', '3');
  markerStart.setAttribute('refY', '3');
  markerStart.setAttribute('orient', 'auto');
  markerStart.setAttribute('markerUnits', 'strokeWidth');
  const markerStartPath = document.createElementNS(SVG_NS, 'path');
  markerStartPath.setAttribute('d', 'M6 0 L0 3 L6 6');
  markerStartPath.setAttribute('fill', 'none');
  markerStartPath.setAttribute('stroke', '#0f172a');
  markerStartPath.setAttribute('stroke-width', '1.5');
  markerStart.appendChild(markerStartPath);

  const markerEnd = document.createElementNS(SVG_NS, 'marker');
  markerEnd.setAttribute('id', endMarkerId);
  markerEnd.setAttribute('markerWidth', '6');
  markerEnd.setAttribute('markerHeight', '6');
  markerEnd.setAttribute('refX', '3');
  markerEnd.setAttribute('refY', '3');
  markerEnd.setAttribute('orient', 'auto');
  markerEnd.setAttribute('markerUnits', 'strokeWidth');
  const markerEndPath = document.createElementNS(SVG_NS, 'path');
  markerEndPath.setAttribute('d', 'M0 0 L6 3 L0 6');
  markerEndPath.setAttribute('fill', 'none');
  markerEndPath.setAttribute('stroke', '#0f172a');
  markerEndPath.setAttribute('stroke-width', '1.5');
  markerEnd.appendChild(markerEndPath);

  defs.appendChild(markerStart);
  defs.appendChild(markerEnd);
  svg.appendChild(defs);

  const strokeWidth = Math.max(baseSize * 0.005, 1);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('stroke', '#0f172a');
  group.setAttribute('stroke-width', strokeWidth);
  group.setAttribute('fill', 'none');

  const horizontalY = originalViewBox.minY + baseHeight + margin * 0.6;
  const verticalX = originalViewBox.minX + baseWidth + margin * 0.6;

  const hLine = document.createElementNS(SVG_NS, 'line');
  hLine.setAttribute('x1', originalViewBox.minX);
  hLine.setAttribute('y1', horizontalY);
  hLine.setAttribute('x2', originalViewBox.minX + baseWidth);
  hLine.setAttribute('y2', horizontalY);
  hLine.setAttribute('marker-start', `url(#${startMarkerId})`);
  hLine.setAttribute('marker-end', `url(#${endMarkerId})`);

  const vLine = document.createElementNS(SVG_NS, 'line');
  vLine.setAttribute('x1', verticalX);
  vLine.setAttribute('y1', originalViewBox.minY);
  vLine.setAttribute('x2', verticalX);
  vLine.setAttribute('y2', originalViewBox.minY + baseHeight);
  vLine.setAttribute('marker-start', `url(#${startMarkerId})`);
  vLine.setAttribute('marker-end', `url(#${endMarkerId})`);

  const extLeft = document.createElementNS(SVG_NS, 'line');
  extLeft.setAttribute('x1', originalViewBox.minX);
  extLeft.setAttribute('y1', originalViewBox.minY + baseHeight);
  extLeft.setAttribute('x2', originalViewBox.minX);
  extLeft.setAttribute('y2', horizontalY);

  const extRight = document.createElementNS(SVG_NS, 'line');
  extRight.setAttribute('x1', originalViewBox.minX + baseWidth);
  extRight.setAttribute('y1', originalViewBox.minY + baseHeight);
  extRight.setAttribute('x2', originalViewBox.minX + baseWidth);
  extRight.setAttribute('y2', horizontalY);

  const extTop = document.createElementNS(SVG_NS, 'line');
  extTop.setAttribute('x1', originalViewBox.minX + baseWidth);
  extTop.setAttribute('y1', originalViewBox.minY);
  extTop.setAttribute('x2', verticalX);
  extTop.setAttribute('y2', originalViewBox.minY);

  const extBottom = document.createElementNS(SVG_NS, 'line');
  extBottom.setAttribute('x1', originalViewBox.minX + baseWidth);
  extBottom.setAttribute('y1', originalViewBox.minY + baseHeight);
  extBottom.setAttribute('x2', verticalX);
  extBottom.setAttribute('y2', originalViewBox.minY + baseHeight);

  group.appendChild(hLine);
  group.appendChild(vLine);
  group.appendChild(extLeft);
  group.appendChild(extRight);
  group.appendChild(extTop);
  group.appendChild(extBottom);

  const textGroup = document.createElementNS(SVG_NS, 'g');
  textGroup.setAttribute('fill', '#0f172a');
  textGroup.setAttribute('font-family', '"BIZ UDPGothic", "Hiragino Sans", sans-serif');
  textGroup.setAttribute('font-size', Math.max(baseSize * 0.06, 12));
  textGroup.setAttribute('text-anchor', 'middle');
  textGroup.setAttribute('dominant-baseline', 'middle');

  const widthText = document.createElementNS(SVG_NS, 'text');
  widthText.textContent = `${formatNumber(width)} px`;
  widthText.setAttribute('x', originalViewBox.minX + baseWidth / 2);
  widthText.setAttribute('y', horizontalY - Math.max(baseSize * 0.05, 10));

  const heightText = document.createElementNS(SVG_NS, 'text');
  heightText.textContent = `${formatNumber(height)} px`;
  const textX = verticalX - Math.max(baseSize * 0.05, 10);
  const textY = originalViewBox.minY + baseHeight / 2;
  heightText.setAttribute('x', textX);
  heightText.setAttribute('y', textY);
  heightText.setAttribute('transform', `rotate(-90 ${textX} ${textY})`);

  textGroup.appendChild(widthText);
  textGroup.appendChild(heightText);

  svg.appendChild(group);
  svg.appendChild(textGroup);

  return new XMLSerializer().serializeToString(svg);
}

function displaySvg(target, svgText) {
  target.innerHTML = svgText;
}

function revokeCurrentUrls() {
  if (currentResizedUrl) {
    URL.revokeObjectURL(currentResizedUrl);
    currentResizedUrl = null;
  }
  if (currentDimensionedUrl) {
    URL.revokeObjectURL(currentDimensionedUrl);
    currentDimensionedUrl = null;
  }
}

function enableDownloads(resizedText, dimensionedText) {
  revokeCurrentUrls();

  const resizedBlob = new Blob([resizedText], { type: 'image/svg+xml' });
  const dimensionedBlob = new Blob([dimensionedText], { type: 'image/svg+xml' });

  currentResizedUrl = URL.createObjectURL(resizedBlob);
  currentDimensionedUrl = URL.createObjectURL(dimensionedBlob);

  downloadResizedButton.disabled = false;
  downloadDimensionedButton.disabled = false;

  downloadResizedButton.onclick = () => {
    triggerDownload(currentResizedUrl, 'resized.svg');
  };

  downloadDimensionedButton.onclick = () => {
    triggerDownload(currentDimensionedUrl, 'dimensioned.svg');
  };
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function showError(message) {
  alert(message);
}

loadButton.addEventListener('click', async () => {
  try {
    let svgText = svgSourceTextarea.value.trim();
    if (!svgText && svgFileInput.files && svgFileInput.files[0]) {
      svgText = await readFileAsText(svgFileInput.files[0]);
    }

    if (!svgText) {
      showError('SVG ファイルを選択するか、テキストを貼り付けてください。');
      return;
    }

    const parsed = parseSvg(svgText);
    originalSvgElement = parsed.svgElement;
    originalViewBox = parsed.viewBox;
    originalWidth = parsed.width;
    originalHeight = parsed.height;
    updateAspectRatio();

    widthInput.value = formatNumber(originalWidth);
    heightInput.value = formatNumber(originalHeight);

    controlsSection.hidden = false;
    previewSection.hidden = true;
    resizedPreview.innerHTML = '';
    dimensionedPreview.innerHTML = '';
    downloadResizedButton.disabled = true;
    downloadDimensionedButton.disabled = true;
    revokeCurrentUrls();
  } catch (error) {
    console.error(error);
    showError('SVG の読み込みに失敗しました。形式を確認してください。');
  }
});

widthInput.addEventListener('input', () => {
  if (lockRatioCheckbox.checked && aspectRatio) {
    const width = Number(widthInput.value);
    if (Number.isFinite(width)) {
      heightInput.value = formatNumber(width / aspectRatio);
    }
  }
});

heightInput.addEventListener('input', () => {
  if (lockRatioCheckbox.checked && aspectRatio) {
    const height = Number(heightInput.value);
    if (Number.isFinite(height)) {
      widthInput.value = formatNumber(height * aspectRatio);
    }
  }
});

lockRatioCheckbox.addEventListener('change', () => {
  if (lockRatioCheckbox.checked && aspectRatio) {
    const width = Number(widthInput.value) || originalWidth;
    heightInput.value = formatNumber(width / aspectRatio);
  }
});

applyButton.addEventListener('click', () => {
  if (!originalSvgElement) {
    showError('先に SVG を読み込んでください。');
    return;
  }

  const width = Number(widthInput.value);
  const height = Number(heightInput.value);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    showError('幅と高さには 1 以上の数値を入力してください。');
    return;
  }

  resizedSvgText = createResizedSvgText(width, height);
  dimensionedSvgText = createDimensionedSvgText(width, height);

  displaySvg(resizedPreview, resizedSvgText);
  displaySvg(dimensionedPreview, dimensionedSvgText);
  enableDownloads(resizedSvgText, dimensionedSvgText);

  previewSection.hidden = false;
});

window.addEventListener('beforeunload', revokeCurrentUrls);

function applyNamespaceAttributes(element) {
  namespaceAttributes.forEach((attr) => {
    element.setAttribute(attr.name, attr.value);
  });
}
