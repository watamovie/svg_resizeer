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
  const backgroundColorInput = document.getElementById('backgroundColor');
  const transparentBackgroundCheckbox = document.getElementById('transparentBackground');
  const showDimensionsCheckbox = document.getElementById('showDimensions');
  const showDimensionLabelsCheckbox = document.getElementById('showDimensionLabels');
  const roundDimensionValuesCheckbox = document.getElementById('roundDimensionValues');
  const dimensionFontSizeSlider = document.getElementById('dimensionFontSize');
  const dimensionFontSizeValue = document.getElementById('dimensionFontSizeValue');
  const dimensionFontSizeGroup = dimensionFontSizeSlider
    ? dimensionFontSizeSlider.closest('.control-group')
    : null;
  const showDimensionLabelsControl = showDimensionLabelsCheckbox
    ? showDimensionLabelsCheckbox.closest('.checkbox')
    : null;
  const roundDimensionValuesControl = roundDimensionValuesCheckbox
    ? roundDimensionValuesCheckbox.closest('.checkbox')
    : null;
  const previewArea = document.getElementById('previewArea');
  const messageEl = document.getElementById('message');
  const downloadSvgLink = document.getElementById('downloadSvg');
  const downloadPngLink = document.getElementById('downloadPng');

  const unitConversions = {
    px: {
      label: 'px',
      suffix: 'px',
      toPx: (value) => value,
      fromPx: (value) => value,
    },
    mm: {
      label: 'mm',
      suffix: 'mm',
      toPx: (value) => value * (96 / 25.4),
      fromPx: (value) => value * (25.4 / 96),
    },
  };

  let originalRatio = null;
  let activeObjectUrls = [];
  let lastKnownDimensionsPx = { width: null, height: null };
  let lastSelectedUnit = unitSelect ? unitSelect.value : 'px';
  let measurementContainer = null;

  function setMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.classList.toggle('error', isError);
  }

  function clearObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls = [];
  }

  function getConversion(unit = unitSelect.value) {
    return unitConversions[unit] || unitConversions.px;
  }

  function toPx(value, unit = unitSelect.value) {
    return getConversion(unit).toPx(value);
  }

  function fromPx(value, unit = unitSelect.value) {
    return getConversion(unit).fromPx(value);
  }

  function ensureMeasurementContainer() {
    if (!measurementContainer) {
      measurementContainer = document.createElement('div');
      measurementContainer.setAttribute('aria-hidden', 'true');
      measurementContainer.style.position = 'fixed';
      measurementContainer.style.width = '0';
      measurementContainer.style.height = '0';
      measurementContainer.style.overflow = 'hidden';
      measurementContainer.style.opacity = '0';
      measurementContainer.style.pointerEvents = 'none';
      measurementContainer.style.zIndex = '-1';
      document.body.appendChild(measurementContainer);
    }
    return measurementContainer;
  }

  function getContentBounds(svgEl) {
    if (!svgEl) return null;
    const container = ensureMeasurementContainer();
    const clone = svgEl.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    if (!clone.hasAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    container.appendChild(clone);

    let bbox = null;
    try {
      if (typeof clone.getBBox === 'function') {
        bbox = clone.getBBox();
      }
    } catch (error) {
      bbox = null;
    } finally {
      container.removeChild(clone);
    }

    if (
      bbox &&
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height)
    ) {
      return bbox;
    }
    return null;
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

  function parsePositiveNumber(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  function formatDimensionDisplay(value, options = {}) {
    const { round = false } = options;
    if (!Number.isFinite(value)) return '';
    if (round) {
      return Math.round(value).toString();
    }
    return formatNumber(value);
  }

  function getCurrentDimensionsPx(unit = unitSelect.value) {
    const conversion = getConversion(unit);
    const widthValue = parsePositiveNumber(widthInput.value);
    const heightValue = parsePositiveNumber(heightInput.value);
    return {
      width: widthValue ? conversion.toPx(widthValue) : null,
      height: heightValue ? conversion.toPx(heightValue) : null,
    };
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

    const contentBounds = getContentBounds(svgEl);
    if (contentBounds && contentBounds.width > 0 && contentBounds.height > 0) {
      viewBox = {
        minX: contentBounds.x,
        minY: contentBounds.y,
        width: contentBounds.width,
        height: contentBounds.height,
      };
      width = contentBounds.width;
      height = contentBounds.height;
    }

    if (!viewBox) {
      if (!width || !height) {
        throw new Error('幅・高さを取得できません。viewBoxまたはwidth/height属性を指定してください。');
      }
      viewBox = { minX: 0, minY: 0, width, height };
    }

    svgEl.setAttribute('viewBox', `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);

    return { width, height, viewBox };
  }

  function updateDimensionInputs(metrics) {
    const unit = unitSelect.value;
    if (metrics.width) {
      widthInput.value = formatNumber(fromPx(metrics.width, unit));
      lastKnownDimensionsPx.width = metrics.width;
    }
    if (metrics.height) {
      heightInput.value = formatNumber(fromPx(metrics.height, unit));
      lastKnownDimensionsPx.height = metrics.height;
    }
    if (metrics.width && metrics.height) {
      originalRatio = metrics.width / metrics.height;
      lastKnownDimensionsPx = { width: metrics.width, height: metrics.height };
    }
  }

  function formatNumber(value) {
    return Number.parseFloat(value.toFixed(2)).toString();
  }

  function normalizeHexColor(value) {
    if (typeof value !== 'string') return null;
    const hex = value.trim().replace(/^#/, '');
    if (hex.length === 3) {
      return `#${hex
        .split('')
        .map((char) => char + char)
        .join('')}`;
    }
    if (hex.length === 6) {
      return `#${hex}`;
    }
    return null;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    const value = normalized.replace('#', '');
    const bigint = Number.parseInt(value, 16);
    if (!Number.isFinite(bigint)) return null;
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }

  function relativeLuminance({ r, g, b }) {
    const toLinear = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const linearR = toLinear(r);
    const linearG = toLinear(g);
    const linearB = toLinear(b);
    return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
  }

  function getDimensionColors(options = {}) {
    const { transparentBackground = false, backgroundColor } = options;
    const defaultStroke = '#374151';
    const defaultText = '#111827';

    if (transparentBackground) {
      return { stroke: defaultStroke, text: defaultText };
    }

    const rgb = hexToRgb(backgroundColor);
    if (!rgb) {
      return { stroke: defaultStroke, text: defaultText };
    }

    const luminance = relativeLuminance(rgb);
    if (luminance < 0.4) {
      return { stroke: '#f9fafb', text: '#f9fafb' };
    }

    return { stroke: defaultStroke, text: defaultText };
  }

  function generateResizedSvg(svgEl, targetWidthPx, targetHeightPx, unit, options = {}) {
    const {
      includeDimensions = true,
      showDimensionLabels = true,
      roundDimensionDisplay = false,
      backgroundColor = '#ffffff',
      transparentBackground = false,
      dimensionTextScale = 1,
    } = options;
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

    const marginBase = Math.max(Math.max(viewBox.width, viewBox.height) * 0.12, 24);
    const scaleRef = Math.max(viewBox.width, viewBox.height) || 1;
    const strokeWidth = Math.max(scaleRef * 0.004, 0.75);
    const baseFontSize = Math.max(scaleRef * 0.06, 12);
    const fontSize = baseFontSize * Math.max(dimensionTextScale, 0.2);
    const tickSize = Math.max(
      marginBase * 0.35,
      Math.min(viewBox.width, viewBox.height) * 0.08,
      8
    );
    const textOffset = Math.max(fontSize * 0.7, strokeWidth * 6, tickSize * 0.85);
    const dimOffset = Math.max(marginBase * 0.6, tickSize + fontSize * 0.35);

    const bottomMargin = Math.max(
      marginBase,
      dimOffset + tickSize + textOffset + fontSize * 1.1
    );
    const rightMargin = Math.max(marginBase, dimOffset + tickSize + textOffset + fontSize * 0.9);
    const topMargin = marginBase;
    const leftMargin = marginBase;

    const finalViewBox = {
      minX: viewBox.minX - leftMargin,
      minY: viewBox.minY - topMargin,
      width: viewBox.width + leftMargin + rightMargin,
      height: viewBox.height + topMargin + bottomMargin,
    };

    const horizontalY = viewBox.minY + viewBox.height + dimOffset;
    const verticalX = viewBox.minX + viewBox.width + dimOffset;

    const horizontalLabelY = horizontalY + textOffset;
    const verticalLabelX = verticalX + textOffset;

    const markerIdBase = 'dimension-arrow-marker';

    const dimensionColors = getDimensionColors({
      transparentBackground,
      backgroundColor,
    });

    const defs = includeDimensions
      ? `
      <defs data-generated-by="dimension-overlay">
        <marker id="${markerIdBase}-start" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M6 3L0 6V0L6 3Z" fill="${dimensionColors.stroke}"></path>
        </marker>
        <marker id="${markerIdBase}-end" markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0 3L6 6V0L0 3Z" fill="${dimensionColors.stroke}"></path>
        </marker>
      </defs>`
      : '';

    const dimensionLines = includeDimensions
      ? `
      <g data-generated-by="dimension-overlay" fill="none" stroke="${dimensionColors.stroke}" stroke-width="${strokeWidth}" stroke-linecap="round">
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
      </g>`
      : '';

    const conversion = getConversion(unit);
    const displayWidth = conversion.fromPx(targetWidthPx);
    const displayHeight = conversion.fromPx(targetHeightPx);
    const unitLabel = conversion.label;
    const unitSuffix = conversion.suffix;
    const formattedDisplayWidth = formatDimensionDisplay(displayWidth, {
      round: roundDimensionDisplay,
    });
    const formattedDisplayHeight = formatDimensionDisplay(displayHeight, {
      round: roundDimensionDisplay,
    });
    const widthLabelText = `${showDimensionLabels ? '幅 ' : ''}${formattedDisplayWidth}${unitLabel}`;
    const heightLabelText = `${showDimensionLabels ? '高さ ' : ''}${formattedDisplayHeight}${unitLabel}`;

    const labels = includeDimensions
      ? `
      <g data-generated-by="dimension-overlay" fill="${dimensionColors.text}" font-size="${fontSize}" font-weight="600" font-family="'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif">
        <text x="${viewBox.minX + viewBox.width / 2}" y="${horizontalLabelY}" text-anchor="middle" dominant-baseline="text-before-edge">${widthLabelText}</text>
        <text x="${verticalLabelX}" y="${viewBox.minY + viewBox.height / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${verticalLabelX} ${viewBox.minY + viewBox.height / 2})">${heightLabelText}</text>
      </g>`
      : '';

    const widthAttr = `${formatNumber(displayWidth)}${unitSuffix}`;
    const heightAttr = `${formatNumber(displayHeight)}${unitSuffix}`;

    const backgroundRect = transparentBackground
      ? ''
      : `<rect data-generated-by="dimension-overlay" x="${finalViewBox.minX}" y="${finalViewBox.minY}" width="${finalViewBox.width}" height="${finalViewBox.height}" fill="${backgroundColor}"></rect>`;

    const svgString = `
      <svg ${nsAttrString} width="${widthAttr}" height="${heightAttr}" viewBox="${finalViewBox.minX} ${finalViewBox.minY} ${finalViewBox.width} ${finalViewBox.height}">
        ${defs}
        ${backgroundRect}
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

  function performResize(options = {}) {
    const { silent = false } = options;
    const svgText = svgInput.value.trim();
    if (!svgText) {
      if (!silent) {
        setMessage('SVGコードを入力するかファイルを読み込んでください。', true);
      }
      return;
    }

    const widthValue = parsePositiveNumber(widthInput.value);
    const heightValue = parsePositiveNumber(heightInput.value);

    if (!widthValue || !heightValue) {
      if (!silent) {
        setMessage('幅・高さには0より大きい数値を入力してください。', true);
      }
      return;
    }

    const unit = unitSelect.value;
    const targetWidthPx = toPx(widthValue, unit);
    const targetHeightPx = toPx(heightValue, unit);

    try {
      const svgEl = parseSvg(svgText);
      const svgString = generateResizedSvg(svgEl, targetWidthPx, targetHeightPx, unit, {
        includeDimensions: showDimensionsCheckbox ? showDimensionsCheckbox.checked : true,
        showDimensionLabels: showDimensionLabelsCheckbox
          ? showDimensionLabelsCheckbox.checked
          : true,
        roundDimensionDisplay: roundDimensionValuesCheckbox
          ? roundDimensionValuesCheckbox.checked
          : false,
        backgroundColor: backgroundColorInput ? backgroundColorInput.value : '#ffffff',
        transparentBackground: transparentBackgroundCheckbox
          ? transparentBackgroundCheckbox.checked
          : false,
        dimensionTextScale: dimensionFontSizeSlider
          ? Math.max(parseFloat(dimensionFontSizeSlider.value) / 100, 0.2)
          : 1,
      });
      previewArea.innerHTML = svgString;
      updateDownloads(svgString, targetWidthPx, targetHeightPx);
      if (!silent) {
        setMessage('リサイズと寸法線の追加が完了しました。');
      }
      originalRatio = targetWidthPx / targetHeightPx;
      lastKnownDimensionsPx = { width: targetWidthPx, height: targetHeightPx };
    } catch (error) {
      console.error(error);
      if (!silent) {
        setMessage(error.message || '処理中にエラーが発生しました。', true);
      }
      previewArea.innerHTML = '';
      downloadSvgLink.setAttribute('aria-disabled', 'true');
      downloadSvgLink.removeAttribute('href');
      downloadPngLink.setAttribute('aria-disabled', 'true');
      downloadPngLink.removeAttribute('href');
      clearObjectUrls();
    }
  }

  function handleRasterFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) {
        setMessage('画像の読み込みに失敗しました。', true);
        return;
      }

      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;

        if (!width || !height) {
          setMessage('画像サイズを取得できませんでした。', true);
          return;
        }

        const svgString = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <image href="${dataUrl}" width="${width}" height="${height}" preserveAspectRatio="none" />
          </svg>
        `;

        const normalizedSvgString = svgString.trim();
        svgInput.value = normalizedSvgString;
        try {
          const svgEl = parseSvg(normalizedSvgString);
          const metrics = getMetrics(svgEl);
          updateDimensionInputs(metrics);
          setMessage('画像ファイルをSVGとして読み込みました。寸法を調整してリサイズしてください。');
        } catch (error) {
          setMessage(error.message, true);
        }
      };
      image.onerror = () => setMessage('画像の読み込みに失敗しました。', true);
      image.src = dataUrl;
    };
    reader.onerror = () => setMessage('ファイルの読み込みに失敗しました。', true);
    reader.readAsDataURL(file);
  }

  function handleFile(file) {
    if (!file) {
      setMessage('');
      return;
    }

    const fileName = (file.name || '').toLowerCase();

    if (file.type === 'image/svg+xml' || fileName.endsWith('.svg')) {
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
      return;
    }

    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/i.test(fileName)) {
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

  resizeButton.addEventListener('click', (event) => {
    event.preventDefault();
    performResize();
  });

  function refreshPreviewIfReady() {
    const svgText = svgInput.value.trim();
    if (!svgText) return;
    const widthValue = parsePositiveNumber(widthInput.value);
    const heightValue = parsePositiveNumber(heightInput.value);
    if (!widthValue || !heightValue) return;
    performResize({ silent: true });
  }

  const updateDimensionFontSizeValue = () => {
    if (!dimensionFontSizeSlider || !dimensionFontSizeValue) return;
    dimensionFontSizeValue.textContent = `${dimensionFontSizeSlider.value}%`;
  };

  function setCheckboxControlState(checkbox, wrapper, enabled) {
    if (!checkbox) return;
    checkbox.disabled = !enabled;
    if (enabled) {
      checkbox.removeAttribute('aria-disabled');
    } else {
      checkbox.setAttribute('aria-disabled', 'true');
    }
    if (wrapper) {
      wrapper.classList.toggle('is-disabled', !enabled);
    }
  }

  if (dimensionFontSizeSlider) {
    dimensionFontSizeSlider.addEventListener('input', () => {
      updateDimensionFontSizeValue();
      refreshPreviewIfReady();
    });
    updateDimensionFontSizeValue();
  }

  const updateDimensionControlsState = () => {
    const enabled = showDimensionsCheckbox ? showDimensionsCheckbox.checked : true;
    if (dimensionFontSizeSlider) {
      dimensionFontSizeSlider.disabled = !enabled;
      if (enabled) {
        dimensionFontSizeSlider.removeAttribute('aria-disabled');
      } else {
        dimensionFontSizeSlider.setAttribute('aria-disabled', 'true');
      }
    }
    if (dimensionFontSizeGroup) {
      dimensionFontSizeGroup.classList.toggle('is-disabled', !enabled);
    }
    setCheckboxControlState(
      showDimensionLabelsCheckbox,
      showDimensionLabelsControl,
      enabled
    );
    setCheckboxControlState(
      roundDimensionValuesCheckbox,
      roundDimensionValuesControl,
      enabled
    );
  };

  widthInput.addEventListener('input', () => {
    const unit = unitSelect.value;
    const widthValue = parsePositiveNumber(widthInput.value);

    if (widthValue) {
      const widthPx = toPx(widthValue, unit);
      lastKnownDimensionsPx.width = widthPx;

      if (lockRatio.checked && originalRatio && !heightInput.matches(':focus')) {
        const heightPx = widthPx / originalRatio;
        if (Number.isFinite(heightPx) && heightPx > 0) {
          heightInput.value = formatNumber(fromPx(heightPx, unit));
          lastKnownDimensionsPx.height = heightPx;
        }
      }
    }

    if (!lockRatio.checked) {
      const dims = getCurrentDimensionsPx(unit);
      if (dims.width && dims.height) {
        originalRatio = dims.width / dims.height;
        lastKnownDimensionsPx = dims;
      }
    }
  });

  heightInput.addEventListener('input', () => {
    const unit = unitSelect.value;
    const heightValue = parsePositiveNumber(heightInput.value);

    if (heightValue) {
      const heightPx = toPx(heightValue, unit);
      lastKnownDimensionsPx.height = heightPx;

      if (lockRatio.checked && originalRatio && !widthInput.matches(':focus')) {
        const widthPx = heightPx * originalRatio;
        if (Number.isFinite(widthPx) && widthPx > 0) {
          widthInput.value = formatNumber(fromPx(widthPx, unit));
          lastKnownDimensionsPx.width = widthPx;
        }
      }
    }

    if (!lockRatio.checked) {
      const dims = getCurrentDimensionsPx(unit);
      if (dims.width && dims.height) {
        originalRatio = dims.width / dims.height;
        lastKnownDimensionsPx = dims;
      }
    }
  });

  if (unitSelect) {
    unitSelect.addEventListener('change', () => {
      const newUnit = unitSelect.value;
      const prevConversion = getConversion(lastSelectedUnit);
      const nextConversion = getConversion(newUnit);

      const currentWidthValue = parsePositiveNumber(widthInput.value);
      const currentHeightValue = parsePositiveNumber(heightInput.value);

      let widthPx = currentWidthValue ? prevConversion.toPx(currentWidthValue) : lastKnownDimensionsPx.width;
      let heightPx = currentHeightValue ? prevConversion.toPx(currentHeightValue) : lastKnownDimensionsPx.height;

      if (widthPx) {
        widthInput.value = formatNumber(nextConversion.fromPx(widthPx));
        lastKnownDimensionsPx.width = widthPx;
      } else {
        widthInput.value = '';
      }

      if (heightPx) {
        heightInput.value = formatNumber(nextConversion.fromPx(heightPx));
        lastKnownDimensionsPx.height = heightPx;
      } else {
        heightInput.value = '';
      }

      if (widthPx && heightPx) {
        originalRatio = widthPx / heightPx;
      }

      lastSelectedUnit = newUnit;
    });
  }

  if (backgroundColorInput) {
    backgroundColorInput.addEventListener('input', () => {
      if (transparentBackgroundCheckbox && transparentBackgroundCheckbox.checked) {
        return;
      }
      refreshPreviewIfReady();
    });
  }

  if (transparentBackgroundCheckbox) {
    const updateBackgroundControlState = () => {
      const isTransparent = transparentBackgroundCheckbox.checked;
      if (backgroundColorInput) {
        backgroundColorInput.disabled = isTransparent;
        if (isTransparent) {
          backgroundColorInput.setAttribute('aria-disabled', 'true');
        } else {
          backgroundColorInput.removeAttribute('aria-disabled');
        }
      }
    };

    transparentBackgroundCheckbox.addEventListener('change', () => {
      updateBackgroundControlState();
      refreshPreviewIfReady();
    });

    updateBackgroundControlState();
  }

  if (showDimensionsCheckbox) {
    showDimensionsCheckbox.addEventListener('change', () => {
      updateDimensionControlsState();
      refreshPreviewIfReady();
    });
    updateDimensionControlsState();
  } else {
    updateDimensionControlsState();
  }

  if (showDimensionLabelsCheckbox) {
    showDimensionLabelsCheckbox.addEventListener('change', () => {
      refreshPreviewIfReady();
    });
  }

  if (roundDimensionValuesCheckbox) {
    roundDimensionValuesCheckbox.addEventListener('change', () => {
      refreshPreviewIfReady();
    });
  }

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
