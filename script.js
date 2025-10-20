(() => {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const svgInput = document.getElementById('svgInput');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const unitSelect = document.getElementById('unitSelect');
  const lockRatio = document.getElementById('lockRatio');
  const resizeButton = document.getElementById('resizeButton');
  const previewArea = document.getElementById('previewArea');
  const messageEl = document.getElementById('message');
  const downloadSvgLink = document.getElementById('downloadSvg');
  const downloadPngLink = document.getElementById('downloadPng');

  let originalRatio = null;
  let activeObjectUrls = [];
  const PX_PER_MM = 96 / 25.4;
  let currentUnit = 'px';

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

  function convertPxToCurrentUnit(value) {
    if (!Number.isFinite(value)) return value;
    return currentUnit === 'mm' ? value / PX_PER_MM : value;
  }

  function convertCurrentUnitToPx(value) {
    if (!Number.isFinite(value)) return value;
    return currentUnit === 'mm' ? value * PX_PER_MM : value;
  }

  function formatNumber(value, fractionDigits = 2) {
    if (!Number.isFinite(value)) return '';
    const fixed = value.toFixed(fractionDigits);
    return Number.parseFloat(fixed).toString();
  }

  function updateDimensionInputs(metrics) {
    if (metrics.width) {
      const widthInUnit = convertPxToCurrentUnit(metrics.width);
      widthInput.value = formatNumber(widthInUnit);
    }
    if (metrics.height) {
      const heightInUnit = convertPxToCurrentUnit(metrics.height);
      heightInput.value = formatNumber(heightInUnit);
    }
    if (metrics.width && metrics.height) {
      originalRatio = metrics.width / metrics.height;
    }
  }

  function generateResizedSvg(svgEl, targetWidth, targetHeight, displayOptions = {}) {
    const options = {
      unit: 'px',
      displayWidth: targetWidth,
      displayHeight: targetHeight,
      ...displayOptions,
    };
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

    const baseMargin = Math.max(Math.max(viewBox.width, viewBox.height) * 0.12, 24);
    const scaleRef = Math.max(viewBox.width, viewBox.height) || 1;
    const strokeWidth = Math.max(scaleRef * 0.004, 0.75);
    const fontSize = Math.max(scaleRef * 0.06, 12);
    const margin = Math.max(baseMargin, fontSize * 2.2);
    const finalViewBox = {
      minX: viewBox.minX - margin,
      minY: viewBox.minY - margin,
      width: viewBox.width + margin * 2,
      height: viewBox.height + margin * 2,
    };

    const dimOffset = Math.max(margin * 0.6, fontSize * 1.2);
    const horizontalY = viewBox.minY + viewBox.height + dimOffset;
    const verticalX = viewBox.minX + viewBox.width + dimOffset;
    const tickSize = Math.max(margin * 0.35, Math.min(viewBox.width, viewBox.height) * 0.08, fontSize * 0.45, 8);

    const horizontalLabelY = horizontalY - tickSize - Math.max(fontSize * 0.35, strokeWidth * 2);
    const verticalLabelX = verticalX + tickSize + Math.max(fontSize * 0.35, strokeWidth * 2);

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

    const horizontalLabel =
      options.unit === 'mm'
        ? `幅 ${formatNumber(options.displayWidth)}mm (${formatNumber(targetWidth)}px)`
        : `幅 ${formatNumber(targetWidth)}px`;
    const verticalLabel =
      options.unit === 'mm'
        ? `高さ ${formatNumber(options.displayHeight)}mm (${formatNumber(targetHeight)}px)`
        : `高さ ${formatNumber(targetHeight)}px`;

    const labels = `
      <g data-generated-by="dimension-overlay" fill="#111827" font-size="${fontSize}" font-weight="600" font-family="'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif">
        <text x="${viewBox.minX + viewBox.width / 2}" y="${horizontalLabelY}" text-anchor="middle">${horizontalLabel}</text>
        <text x="${verticalLabelX}" y="${viewBox.minY + viewBox.height / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${verticalLabelX} ${viewBox.minY + viewBox.height / 2})">${verticalLabel}</text>
      </g>`;

    const widthAttribute =
      options.unit === 'mm' ? `${formatNumber(options.displayWidth)}mm` : formatNumber(targetWidth);
    const heightAttribute =
      options.unit === 'mm' ? `${formatNumber(options.displayHeight)}mm` : formatNumber(targetHeight);

    const svgString = `
      <svg ${nsAttrString} width="${widthAttribute}" height="${heightAttribute}" viewBox="${finalViewBox.minX} ${finalViewBox.minY} ${finalViewBox.width} ${finalViewBox.height}">
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

    const targetWidthInput = parseFloat(widthInput.value);
    const targetHeightInput = parseFloat(heightInput.value);

    const targetWidth = convertCurrentUnitToPx(targetWidthInput);
    const targetHeight = convertCurrentUnitToPx(targetHeightInput);

    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
      setMessage('幅・高さには0より大きい数値を入力してください。', true);
      return;
    }

    try {
      const svgEl = parseSvg(svgText);
      const svgString = generateResizedSvg(svgEl, targetWidth, targetHeight, {
        unit: currentUnit,
        displayWidth: convertPxToCurrentUnit(targetWidth),
        displayHeight: convertPxToCurrentUnit(targetHeight),
      });
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

  function handleSvgFile(contents) {
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

  function handleRasterFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        setMessage('画像の読み込みに失敗しました。', true);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          setMessage('画像のサイズを取得できませんでした。', true);
          return;
        }
        const svgMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <image href="${dataUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
          </svg>
        `;
        svgInput.value = svgMarkup.trim();
        updateDimensionInputs({ width, height });
        originalRatio = width / height;
        setMessage('画像ファイルをSVGとして読み込みました。寸法を調整してリサイズしてください。');
      };
      image.onerror = () => setMessage('画像の読み込みに失敗しました。', true);
      image.src = dataUrl;
    };
    reader.onerror = () => setMessage('ファイルの読み込みに失敗しました。', true);
    reader.readAsDataURL(file);
  }

  function handleFile(file) {
    if (!file) {
      setMessage('ファイルを選択してください。', true);
      return;
    }
    const name = (file.name || '').toLowerCase();
    const isSvg = file.type === 'image/svg+xml' || name.endsWith('.svg');
    const isRaster =
      (file.type && file.type.startsWith('image/')) ||
      ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => name.endsWith(ext));

    if (isSvg) {
      const reader = new FileReader();
      reader.onload = () => {
        const contents = reader.result;
        if (typeof contents === 'string') {
          handleSvgFile(contents);
        }
      };
      reader.onerror = () => setMessage('ファイルの読み込みに失敗しました。', true);
      reader.readAsText(file);
      return;
    }
    if (isRaster) {
      handleRasterFile(file);
      return;
    }
    setMessage('SVGまたは画像ファイルを選択してください。', true);
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

  unitSelect.addEventListener('change', () => {
    const newUnit = unitSelect.value;
    if (newUnit === currentUnit) return;

    const widthValue = parseFloat(widthInput.value);
    const heightValue = parseFloat(heightInput.value);
    const widthPx = convertCurrentUnitToPx(widthValue);
    const heightPx = convertCurrentUnitToPx(heightValue);

    currentUnit = newUnit;

    if (Number.isFinite(widthPx) && widthPx > 0) {
      widthInput.value = formatNumber(convertPxToCurrentUnit(widthPx));
    } else {
      widthInput.value = '';
    }

    if (Number.isFinite(heightPx) && heightPx > 0) {
      heightInput.value = formatNumber(convertPxToCurrentUnit(heightPx));
    } else {
      heightInput.value = '';
    }
  });

  resizeButton.addEventListener('click', (event) => {
    event.preventDefault();
    performResize();
  });

  widthInput.addEventListener('input', () => {
    if (lockRatio.checked && originalRatio && !heightInput.matches(':focus')) {
      const value = parseFloat(widthInput.value);
      if (Number.isFinite(value) && value > 0) {
        const widthPx = convertCurrentUnitToPx(value);
        const heightPx = widthPx / originalRatio;
        const heightInUnit = convertPxToCurrentUnit(heightPx);
        heightInput.value = formatNumber(heightInUnit);
      }
    }
  });

  heightInput.addEventListener('input', () => {
    if (lockRatio.checked && originalRatio && !widthInput.matches(':focus')) {
      const value = parseFloat(heightInput.value);
      if (Number.isFinite(value) && value > 0) {
        const heightPx = convertCurrentUnitToPx(value);
        const widthPx = heightPx * originalRatio;
        const widthInUnit = convertPxToCurrentUnit(widthPx);
        widthInput.value = formatNumber(widthInUnit);
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
