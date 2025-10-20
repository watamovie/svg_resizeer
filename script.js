(() => {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const svgInput = document.getElementById('svgInput');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const lockRatio = document.getElementById('lockRatio');
  const resizeButton = document.getElementById('resizeButton');
  const previewArea = document.getElementById('previewArea');
  const messageEl = document.getElementById('message');
  const downloadSvgLink = document.getElementById('downloadSvg');
  const downloadPngLink = document.getElementById('downloadPng');

  let originalRatio = null;
  let activeObjectUrls = [];

  function setMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.classList.toggle('error', isError);
  }

  function clearObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls = [];
  }

  function parseLength(value) {
    if (!value) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^([+-]?\d*\.?\d+)([a-z%]*)$/i);
    if (!match) return Number(trimmed) || null;
    const number = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (!unit || unit === 'px') return number;
    const conversion = {
      in: 96,
      cm: 96 / 2.54,
      mm: 96 / 25.4,
      pt: 96 / 72,
      pc: 16,
    };
    if (conversion[unit]) return number * conversion[unit];
    return number;
  }

  function parseSvg(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('SVGの解析に失敗しました。内容を確認してください。');
    }
    const svgEl = doc.documentElement;
    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') {
      throw new Error('有効な&lt;svg&gt;要素が見つかりません。');
    }
    return svgEl;
  }

  function getMetrics(svgEl) {
    const widthAttr = svgEl.getAttribute('width');
    const heightAttr = svgEl.getAttribute('height');
    let width = parseLength(widthAttr);
    let height = parseLength(heightAttr);
    const viewBoxAttr = svgEl.getAttribute('viewBox');
    let viewBox = null;

    if (viewBoxAttr) {
      const parts = viewBoxAttr.split(/[,\s]+/).map((part) => parseFloat(part));
      if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
        viewBox = {
          minX: parts[0],
          minY: parts[1],
          width: parts[2],
          height: parts[3],
        };
        if (!width) width = viewBox.width;
        if (!height) height = viewBox.height;
      }
    }

    if (!viewBox) {
      if (!width || !height) {
        throw new Error('幅・高さを取得できません。viewBoxまたはwidth/height属性を指定してください。');
      }
      viewBox = { minX: 0, minY: 0, width, height };
      svgEl.setAttribute('viewBox', `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
    }

    return { width, height, viewBox };
  }

  function updateDimensionInputs(metrics) {
    if (metrics.width) {
      widthInput.value = Math.round(metrics.width);
    }
    if (metrics.height) {
      heightInput.value = Math.round(metrics.height);
    }
    if (metrics.width && metrics.height) {
      originalRatio = metrics.width / metrics.height;
    }
  }

  function formatNumber(value) {
    return Number.parseFloat(value.toFixed(2)).toString();
  }

  function generateResizedSvg(svgEl, targetWidth, targetHeight) {
    const metrics = getMetrics(svgEl);
    const viewBox = metrics.viewBox;
    const serializer = new XMLSerializer();

    const clone = svgEl.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');

    const childMarkup = Array.from(clone.childNodes)
      .map((node) => serializer.serializeToString(node))
      .join('');

    const namespaceAttrs = Array.from(svgEl.attributes)
      .filter((attr) => attr.name.startsWith('xmlns'))
      .reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, { xmlns: 'http://www.w3.org/2000/svg' });

    const nsAttrString = Object.entries(namespaceAttrs)
      .map(([name, value]) => `${name}="${value}"`)
      .join(' ');

    const margin = Math.max(Math.max(viewBox.width, viewBox.height) * 0.12, 24);
    const finalViewBox = {
      minX: viewBox.minX - margin,
      minY: viewBox.minY - margin,
      width: viewBox.width + margin * 2,
      height: viewBox.height + margin * 2,
    };

    const dimOffset = margin * 0.6;
    const horizontalY = viewBox.minY + viewBox.height + dimOffset;
    const verticalX = viewBox.minX + viewBox.width + dimOffset;
    const tickSize = Math.max(margin * 0.35, Math.min(viewBox.width, viewBox.height) * 0.08, 8);

    const scaleRef = Math.max(viewBox.width, viewBox.height) || 1;
    const strokeWidth = Math.max(scaleRef * 0.004, 0.75);
    const fontSize = Math.max(scaleRef * 0.06, 12);

    const markerIdBase = 'dimension-arrow-marker';

    const defs = `
      <defs data-generated-by="dimension-overlay">
        <marker id="${markerIdBase}-start" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M6 3L0 6V0L6 3Z" fill="#374151"></path>
        </marker>
        <marker id="${markerIdBase}-end" markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0 3L6 6V0L0 3Z" fill="#374151"></path>
        </marker>
      </defs>`;

    const dimensionLines = `
      <g data-generated-by="dimension-overlay" fill="none" stroke="#374151" stroke-width="${strokeWidth}" stroke-linecap="round">
        <line x1="${viewBox.minX}" y1="${horizontalY}" x2="${viewBox.minX + viewBox.width}" y2="${horizontalY}" marker-start="url(#${markerIdBase}-start)" marker-end="url(#${markerIdBase}-end)"></line>
        <line x1="${verticalX}" y1="${viewBox.minY}" x2="${verticalX}" y2="${viewBox.minY + viewBox.height}" marker-start="url(#${markerIdBase}-start)" marker-end="url(#${markerIdBase}-end)"></line>
        <line x1="${viewBox.minX}" y1="${viewBox.minY}" x2="${viewBox.minX}" y2="${horizontalY}" stroke-dasharray="${strokeWidth * 2}"></line>
        <line x1="${viewBox.minX + viewBox.width}" y1="${viewBox.minY}" x2="${viewBox.minX + viewBox.width}" y2="${horizontalY}" stroke-dasharray="${strokeWidth * 2}"></line>
        <line x1="${viewBox.minX}" y1="${viewBox.minY}" x2="${verticalX}" y2="${viewBox.minY}" stroke-dasharray="${strokeWidth * 2}"></line>
        <line x1="${viewBox.minX}" y1="${viewBox.minY + viewBox.height}" x2="${verticalX}" y2="${viewBox.minY + viewBox.height}" stroke-dasharray="${strokeWidth * 2}"></line>
        <line x1="${viewBox.minX}" y1="${horizontalY}" x2="${viewBox.minX}" y2="${horizontalY + tickSize}"></line>
        <line x1="${viewBox.minX + viewBox.width}" y1="${horizontalY}" x2="${viewBox.minX + viewBox.width}" y2="${horizontalY + tickSize}"></line>
        <line x1="${verticalX}" y1="${viewBox.minY}" x2="${verticalX + tickSize}" y2="${viewBox.minY}"></line>
        <line x1="${verticalX}" y1="${viewBox.minY + viewBox.height}" x2="${verticalX + tickSize}" y2="${viewBox.minY + viewBox.height}"></line>
      </g>`;

    const labels = `
      <g data-generated-by="dimension-overlay" fill="#111827" font-size="${fontSize}" font-weight="600" font-family="'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif">
        <text x="${viewBox.minX + viewBox.width / 2}" y="${horizontalY - strokeWidth * 2}" text-anchor="middle">幅 ${formatNumber(targetWidth)}px</text>
        <text x="${verticalX + strokeWidth * 2}" y="${viewBox.minY + viewBox.height / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${verticalX + strokeWidth * 2} ${viewBox.minY + viewBox.height / 2})">高さ ${formatNumber(targetHeight)}px</text>
      </g>`;

    const svgString = `
      <svg ${nsAttrString} width="${formatNumber(targetWidth)}" height="${formatNumber(targetHeight)}" viewBox="${finalViewBox.minX} ${finalViewBox.minY} ${finalViewBox.width} ${finalViewBox.height}">
        ${defs}
        <g>
          ${childMarkup}
        </g>
        ${dimensionLines}
        ${labels}
      </svg>
    `;

    return svgString;
  }

  function updateDownloads(svgString, width, height) {
    clearObjectUrls();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadSvgLink.href = url;
    downloadSvgLink.setAttribute('aria-disabled', 'false');
    activeObjectUrls.push(url);

    downloadPngLink.setAttribute('aria-disabled', 'true');
    downloadPngLink.removeAttribute('href');

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(Math.round(width), 1);
      canvas.height = Math.max(Math.round(height), 1);
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          const pngUrl = URL.createObjectURL(pngBlob);
          downloadPngLink.href = pngUrl;
          downloadPngLink.setAttribute('aria-disabled', 'false');
          activeObjectUrls.push(pngUrl);
        } else {
          downloadPngLink.setAttribute('aria-disabled', 'true');
        }
      }, 'image/png');
    };
    image.onerror = () => {
      downloadPngLink.setAttribute('aria-disabled', 'true');
      downloadPngLink.removeAttribute('href');
    };
    image.src = url;
  }

  function performResize() {
    const svgText = svgInput.value.trim();
    if (!svgText) {
      setMessage('SVGコードを入力するかファイルを読み込んでください。', true);
      return;
    }

    const targetWidth = parseFloat(widthInput.value);
    const targetHeight = parseFloat(heightInput.value);

    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
      setMessage('幅・高さには1以上の数値を入力してください。', true);
      return;
    }

    try {
      const svgEl = parseSvg(svgText);
      const svgString = generateResizedSvg(svgEl, targetWidth, targetHeight);
      previewArea.innerHTML = svgString;
      updateDownloads(svgString, targetWidth, targetHeight);
      setMessage('リサイズと寸法線の追加が完了しました。');
    } catch (error) {
      console.error(error);
      setMessage(error.message || '処理中にエラーが発生しました。', true);
      previewArea.innerHTML = '';
      downloadSvgLink.setAttribute('aria-disabled', 'true');
      downloadSvgLink.removeAttribute('href');
      downloadPngLink.setAttribute('aria-disabled', 'true');
      downloadPngLink.removeAttribute('href');
      clearObjectUrls();
    }
  }

  function handleFile(file) {
    if (!file || file.type !== 'image/svg+xml') {
      setMessage('SVGファイルを選択してください。', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const contents = reader.result;
      if (typeof contents === 'string') {
        svgInput.value = contents;
        setMessage('SVGファイルを読み込みました。寸法を調整してリサイズしてください。');
        try {
          const svgEl = parseSvg(contents);
          const metrics = getMetrics(svgEl);
          updateDimensionInputs(metrics);
        } catch (error) {
          setMessage(error.message, true);
        }
      }
    };
    reader.onerror = () => setMessage('ファイルの読み込みに失敗しました。', true);
    reader.readAsText(file);
  }

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleFile(file);
  });

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('is-dragover');
  });

  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  resizeButton.addEventListener('click', (event) => {
    event.preventDefault();
    performResize();
  });

  widthInput.addEventListener('input', () => {
    if (lockRatio.checked && originalRatio && !heightInput.matches(':focus')) {
      const value = parseFloat(widthInput.value);
      if (Number.isFinite(value) && value > 0) {
        heightInput.value = Math.round(value / originalRatio);
      }
    }
  });

  heightInput.addEventListener('input', () => {
    if (lockRatio.checked && originalRatio && !widthInput.matches(':focus')) {
      const value = parseFloat(heightInput.value);
      if (Number.isFinite(value) && value > 0) {
        widthInput.value = Math.round(value * originalRatio);
      }
    }
  });

  svgInput.addEventListener('input', () => {
    const text = svgInput.value.trim();
    if (!text) {
      setMessage('');
      return;
    }
    try {
      const svgEl = parseSvg(text);
      const metrics = getMetrics(svgEl);
      updateDimensionInputs(metrics);
      setMessage('SVGを解析しました。寸法を調整してリサイズしてください。');
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  window.addEventListener('beforeunload', () => {
    clearObjectUrls();
  });
})();
