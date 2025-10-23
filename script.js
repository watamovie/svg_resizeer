(() => {
  'use strict';

  const stepPanels = Array.from(document.querySelectorAll('[data-step]'));

  const goToStep = (stepId) => {
    if (!stepPanels.length || !stepId) {
      return;
    }
    const targetPanel = stepPanels.find((panel) => panel.dataset.step === stepId);
    if (!targetPanel || typeof targetPanel.scrollIntoView !== 'function') {
      return;
    }
    try {
      targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      targetPanel.scrollIntoView(true);
    }

    const focusableSelector =
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusTarget = targetPanel.querySelector(focusableSelector);
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        focusTarget.focus();
      }
    }
  };

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const svgInput = document.getElementById('svgInput');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const unitSelect = document.getElementById('unitSelect');
  const lockRatio = document.getElementById('lockRatio');
  const resizeButton = document.getElementById('resizeButton');
  const backgroundColorInput = document.getElementById('backgroundColor');
  const removeCanvasBackgroundCheckbox = document.getElementById(
    'removeCanvasBackground'
  );
  const applyFillColorCheckbox = document.getElementById('applyFillColor');
  const fillColorInput = document.getElementById('fillColor');
  const fillColorGroup = document.getElementById('fillColorGroup');
  const transparentBackgroundCheckbox = document.getElementById(
    'transparentBackground'
  );
  const showDimensionsCheckbox = document.getElementById('showDimensions');
  const showDimensionLabelsCheckbox = document.getElementById('showDimensionLabels');
  const roundDimensionValuesCheckbox = document.getElementById('roundDimensionValues');
  const showDrillHolesCheckbox = document.getElementById('showDrillHoles');
  const drillHoleOffsetInput = document.getElementById('drillHoleOffset');
  const drillHoleDiameterInput = document.getElementById('drillHoleDiameter');
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
  const drillHoleOffsetGroup = drillHoleOffsetInput
    ? drillHoleOffsetInput.closest('.control-group')
    : document.getElementById('drillHoleOffsetGroup');
  const drillHoleDiameterGroup = drillHoleDiameterInput
    ? drillHoleDiameterInput.closest('.control-group')
    : document.getElementById('drillHoleDiameterGroup');
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

  const MM_TO_PX = 96 / 25.4;

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

  function parseSvgDimension(value, reference) {
    if (value == null) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('%')) {
      const percent = Number.parseFloat(trimmed.slice(0, -1));
      if (!Number.isFinite(percent) || !Number.isFinite(reference)) {
        return null;
      }
      return (percent / 100) * reference;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  function approximatelyEqual(a, b, tolerance = 0.01) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return false;
    }
    return Math.abs(a - b) <= tolerance;
  }

  function parsePositiveNumber(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  function parseNonNegativeNumber(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(min)) {
      min = 0;
    }
    if (!Number.isFinite(max)) {
      max = min;
    }
    if (max < min) {
      return min;
    }
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
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

  function removeCanvasSizedBackgrounds(svgEl, metrics) {
    if (!svgEl || !metrics || !metrics.viewBox) {
      return;
    }

    const { viewBox } = metrics;
    const { width, height } = viewBox;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }

    const tolerance = Math.max(Math.max(width, height) * 0.001, 0.5);
    const rects = svgEl.querySelectorAll('rect');

    rects.forEach((rect) => {
      if (!rect || rect.hasAttribute('data-generated-by')) {
        return;
      }

      const rectWidth = parseSvgDimension(rect.getAttribute('width'), width);
      const rectHeight = parseSvgDimension(rect.getAttribute('height'), height);

      if (
        !Number.isFinite(rectWidth) ||
        !Number.isFinite(rectHeight) ||
        !approximatelyEqual(rectWidth, width, tolerance) ||
        !approximatelyEqual(rectHeight, height, tolerance)
      ) {
        return;
      }

      const rectXValue = parseSvgDimension(rect.getAttribute('x'), width);
      const rectYValue = parseSvgDimension(rect.getAttribute('y'), height);
      const resolvedX = Number.isFinite(rectXValue) ? rectXValue : viewBox.minX;
      const resolvedY = Number.isFinite(rectYValue) ? rectYValue : viewBox.minY;

      if (
        approximatelyEqual(resolvedX, viewBox.minX, tolerance) &&
        approximatelyEqual(resolvedY, viewBox.minY, tolerance)
      ) {
        rect.remove();
      }
    });
  }

  function applyUniformFillColor(svgEl, fillColor) {
    if (!svgEl || !fillColor) {
      return;
    }

    const normalizedColor = normalizeHexColor(fillColor) || fillColor;
    const selectableElements = ['path', 'rect', 'circle', 'ellipse', 'polygon'];
    const elements = svgEl.querySelectorAll(selectableElements.join(','));

    elements.forEach((element) => {
      if (!element || element.closest('defs') || element.hasAttribute('data-generated-by')) {
        return;
      }

      const attributeFill = (element.getAttribute('fill') || '').trim().toLowerCase();
      const styleFill = element.style && element.style.fill ? element.style.fill.trim().toLowerCase() : '';

      if (
        attributeFill === 'none' ||
        attributeFill === 'transparent' ||
        styleFill === 'none' ||
        styleFill === 'transparent'
      ) {
        return;
      }

      if (element.hasAttribute('fill-opacity')) {
        const fillOpacity = Number.parseFloat(element.getAttribute('fill-opacity'));
        if (Number.isFinite(fillOpacity) && fillOpacity === 0) {
          return;
        }
      }

      element.setAttribute('fill', normalizedColor);
      if (element.style) {
        element.style.fill = normalizedColor;
      }
    });
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
      showDrillHoles = false,
      drillHoleOffsetMm = 20,
      drillHoleDiameterMm = 10,
      removeCanvasBackground = false,
      applyFillColor = false,
      fillColorOverride = null,
    } = options;
    const metrics = getMetrics(svgEl);
    const viewBox = metrics.viewBox;
    const serializer = new XMLSerializer();

    const clone = svgEl.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');

    if (removeCanvasBackground) {
      removeCanvasSizedBackgrounds(clone, metrics);
    }

    if (applyFillColor && fillColorOverride) {
      applyUniformFillColor(clone, fillColorOverride);
    }

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
    const drillHoleFillColor =
      normalizeHexColor(backgroundColor) || backgroundColor || '#ffffff';

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
    const approxPrefix = roundDimensionDisplay ? '約' : '';
    const widthValueText = formattedDisplayWidth
      ? `${approxPrefix}${formattedDisplayWidth}${unitLabel}`
      : '';
    const heightValueText = formattedDisplayHeight
      ? `${approxPrefix}${formattedDisplayHeight}${unitLabel}`
      : '';
    const widthLabelText = showDimensionLabels
      ? widthValueText
        ? `幅 ${widthValueText}`
        : '幅'
      : widthValueText;
    const heightLabelText = showDimensionLabels
      ? heightValueText
        ? `高さ ${heightValueText}`
        : '高さ'
      : heightValueText;

    let drillHolesGroup = '';
    if (
      showDrillHoles &&
      Number.isFinite(targetWidthPx) &&
      Number.isFinite(targetHeightPx) &&
      targetWidthPx > 0 &&
      targetHeightPx > 0 &&
      Number.isFinite(viewBox.width) &&
      Number.isFinite(viewBox.height) &&
      viewBox.width > 0 &&
      viewBox.height > 0
    ) {
      const offsetMmValue =
        Number.isFinite(drillHoleOffsetMm) && drillHoleOffsetMm >= 0
          ? drillHoleOffsetMm
          : 20;
      const diameterMmValue =
        Number.isFinite(drillHoleDiameterMm) && drillHoleDiameterMm > 0
          ? drillHoleDiameterMm
          : 10;
      const offsetPx = offsetMmValue * MM_TO_PX;
      const radiusPx = (diameterMmValue / 2) * MM_TO_PX;

      const pxToViewBoxX = (px) => (px * finalViewBox.width) / targetWidthPx;
      const pxToViewBoxY = (px) => (px * finalViewBox.height) / targetHeightPx;

      const offsetX = pxToViewBoxX(offsetPx);
      const offsetY = pxToViewBoxY(offsetPx);
      const radiusX = pxToViewBoxX(radiusPx);
      const radiusY = pxToViewBoxY(radiusPx);
      let radius = Math.min(radiusX, radiusY);

      const maxRadius = Math.min(viewBox.width / 2, viewBox.height / 2);

      if (
        !Number.isFinite(radius) ||
        radius <= 0 ||
        !Number.isFinite(maxRadius) ||
        maxRadius <= 0
      ) {
        radius = 0;
      } else if (radius > maxRadius) {
        radius = maxRadius;
      }

      if (radius > 0) {
        const maxOffsetX = Math.max(viewBox.width - radius, radius);
        const maxOffsetY = Math.max(viewBox.height - radius, radius);
        const safeOffsetX = clamp(offsetX, radius, maxOffsetX);
        const safeOffsetY = clamp(offsetY, radius, maxOffsetY);

        const uniquePositions = (values) => {
          const result = [];
          values.forEach((value) => {
            if (!Number.isFinite(value)) return;
            const exists = result.some(
              (existing) => Math.abs(existing - value) < 1e-3
            );
            if (!exists) {
              result.push(value);
            }
          });
          return result;
        };

        const xPositions = uniquePositions([
          viewBox.minX + safeOffsetX,
          viewBox.minX + viewBox.width - safeOffsetX,
        ]);
        const yPositions = uniquePositions([
          viewBox.minY + safeOffsetY,
          viewBox.minY + viewBox.height - safeOffsetY,
        ]);

        const holeElements = [];
        xPositions.forEach((cx) => {
          yPositions.forEach((cy) => {
            holeElements.push(
              `<circle cx="${cx}" cy="${cy}" r="${radius}"></circle>`
            );
          });
        });

        if (holeElements.length) {
          drillHolesGroup = `
      <g data-generated-by="drill-hole-overlay" fill="${drillHoleFillColor}" stroke="${dimensionColors.stroke}" stroke-width="${strokeWidth}">
        ${holeElements.join('\n        ')}
      </g>`;
        }
      }
    }

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
        ${drillHolesGroup}
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
    const drillHoleOffsetValue = drillHoleOffsetInput
      ? parseNonNegativeNumber(drillHoleOffsetInput.value)
      : null;
    const drillHoleDiameterValue = drillHoleDiameterInput
      ? parsePositiveNumber(drillHoleDiameterInput.value)
      : null;

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
        showDrillHoles: showDrillHolesCheckbox ? showDrillHolesCheckbox.checked : false,
        drillHoleOffsetMm: drillHoleOffsetValue ?? 20,
        drillHoleDiameterMm: drillHoleDiameterValue ?? 10,
        removeCanvasBackground: removeCanvasBackgroundCheckbox
          ? removeCanvasBackgroundCheckbox.checked
          : false,
        applyFillColor: applyFillColorCheckbox
          ? applyFillColorCheckbox.checked
          : false,
        fillColorOverride:
          applyFillColorCheckbox && applyFillColorCheckbox.checked && fillColorInput
            ? fillColorInput.value
            : null,
      });
      previewArea.innerHTML = svgString;
      updateDownloads(svgString, targetWidthPx, targetHeightPx);
      if (!silent) {
        setMessage('リサイズと寸法線の追加が完了しました。');
        goToStep('preview');
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
          goToStep('resize');
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
            goToStep('resize');
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

  function setControlGroupState(group, enabled) {
    if (!group) return;
    group.classList.toggle('is-disabled', !enabled);
    const interactiveElements = group.querySelectorAll(
      'input, select, textarea, button'
    );
    interactiveElements.forEach((element) => {
      element.disabled = !enabled;
      if (enabled) {
        element.removeAttribute('aria-disabled');
      } else {
        element.setAttribute('aria-disabled', 'true');
      }
    });
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

  const updateDrillHoleControlsState = () => {
    const enabled = showDrillHolesCheckbox ? showDrillHolesCheckbox.checked : false;
    setControlGroupState(drillHoleOffsetGroup, enabled);
    setControlGroupState(drillHoleDiameterGroup, enabled);
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

  if (removeCanvasBackgroundCheckbox) {
    removeCanvasBackgroundCheckbox.addEventListener('change', () => {
      refreshPreviewIfReady();
    });
  }

  const updateFillColorControlsState = () => {
    const enabled = applyFillColorCheckbox ? applyFillColorCheckbox.checked : false;
    setControlGroupState(fillColorGroup, enabled);
  };

  if (applyFillColorCheckbox) {
    applyFillColorCheckbox.addEventListener('change', () => {
      updateFillColorControlsState();
      refreshPreviewIfReady();
    });
    updateFillColorControlsState();
  } else if (fillColorGroup) {
    setControlGroupState(fillColorGroup, true);
  }

  if (fillColorInput) {
    fillColorInput.addEventListener('input', () => {
      if (applyFillColorCheckbox && !applyFillColorCheckbox.checked) {
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

  if (showDrillHolesCheckbox) {
    showDrillHolesCheckbox.addEventListener('change', () => {
      updateDrillHoleControlsState();
      refreshPreviewIfReady();
    });
    updateDrillHoleControlsState();
  } else {
    updateDrillHoleControlsState();
  }

  if (drillHoleOffsetInput) {
    drillHoleOffsetInput.addEventListener('input', () => {
      refreshPreviewIfReady();
    });
  }

  if (drillHoleDiameterInput) {
    drillHoleDiameterInput.addEventListener('input', () => {
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
      if (activeStepId === 'input') {
        goToStep('resize');
      }
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  window.addEventListener('beforeunload', () => {
    clearObjectUrls();
  });
})();
