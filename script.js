// DOM Elements
const inputR = document.getElementById('inputR');
const inputG = document.getElementById('inputG');
const inputB = document.getElementById('inputB');
const addDataBtn = document.getElementById('addDataBtn');
const clearBtn = document.getElementById('clearBtn');
const colorPreview = document.getElementById('colorPreview');

const fixedSInput = document.getElementById('fixedS');
const fixedSVal = document.getElementById('fixedSVal');
const dataTableBody = document.querySelector('#dataTable tbody');

// State
let state = {
    data: [], // Array of {id, r, g, b, h, s, v, hex}
    fixedS: 1.0,
    nextId: 1, // Legacy fallback
    counts: {
        Cap: 0,
        Input: 0
    },
    currentSource: 'Input',
    currentImageId: null,
    images: [], // Store captured image data {id, src, markers: []}
    sortState: { key: null, dir: 'asc' },
    layoutMode: 'Auto' // Auto, Mobile, PC
};

// Utility: RGB to HSV
function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;

    let d = max - min;
    s = max == 0 ? 0 : d / max;

    if (max == min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {
        h: h * 360,
        s: s,
        v: v
    };
}

// Utility: RGB to Hex
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Utility: HSV to RGB (h:0-360, s:0-1, v:0-1)
function hsvToRgb(h, s, v) {
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

// Add Single Data Point
function addData() {
    const r = parseInt(inputR.value) || 0;
    const g = parseInt(inputG.value) || 0;
    const b = parseInt(inputB.value) || 0;

    // Validate range
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const rC = clamp(r);
    const gC = clamp(g);
    const bC = clamp(b);

    const hsv = rgbToHsv(rC, gC, bC);

    // Determine ID based on source
    const source = state.currentSource || 'Input';
    state.counts[source] = (state.counts[source] || 0) + 1;
    const id = `${source}#${state.counts[source]}`;

    state.data.push({
        id: id,
        r: rC,
        g: gC,
        b: bC,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        hex: rgbToHex(rC, gC, bC)
    });

    // Reset source to Input for next manual entry, unless explicitly set otherwise
    state.currentSource = 'Input';

    renderAll();

    return id; // Return ID for caller use
}

// Clear Data
function clearData() {
    state.data = [];
    state.nextId = 1;
    renderAll();
}

// Update Preview Box
function updatePreview() {
    const r = Math.max(0, Math.min(255, inputR.value));
    const g = Math.max(0, Math.min(255, inputG.value));
    const b = Math.max(0, Math.min(255, inputB.value));
    colorPreview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

// Layout Management
function updateLayout() {
    const mode = state.layoutMode;
    const body = document.body;

    if (mode === 'Mobile') {
        body.classList.add('is-mobile');
    } else if (mode === 'PC') {
        body.classList.remove('is-mobile');
    } else {
        // Auto: simple width check
        if (window.innerWidth <= 1024) {
            body.classList.add('is-mobile');
        } else {
            body.classList.remove('is-mobile');
        }
    }
}

// Background Generation
// Helper: Generate HSV Gradient Image (DataURL)
function generateGradientImage(fixedV, size = 400) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - cx;
            const dy = cy - y; // Up is Positive
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Normalize distance 0..1
            let axisVal = dist / radius;

            if (axisVal > 1) {
                const idx = (y * size + x) * 4;
                data[idx + 3] = 0;
                continue;
            }

            // Angle
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            // Clockwise Hue
            let h = 360 - angle;
            if (h >= 360) h -= 360;

            // S = Radius (Center is White/Colorless if V=1).
            // Actually, in HSV default Cylinder:
            // Center (S=0) is Greyscale controlled by V.
            // Edge (S=1) is Pure Color controlled by V.

            // Map logic: 
            // The user wants "Background Brightness (V)" slider to go Black -> White (or Full Color).
            // At Slider=0 (V=0), everything should be Black.
            // At Slider=1 (V=1), it is the standard Color Wheel (Center White, Edge Color).

            const s = axisVal;
            const v = fixedV;

            // Note: If V=0, RGB is 0,0,0 (Black). 
            // If V=1, S=0 -> RGB 255,255,255 (White).
            // If V=1, S=1 -> RGB Color.

            const [r, g, b] = hsvToRgb(h, s, v);

            const idx = (y * size + x) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            // Ensure full opacity inside the circle
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

// Helper: Calculate Exact Wavelength from Hue coordinate (Linear Interpolation)
function calculateWavelength(hue) {
    let h = hue % 360;
    if (h < 0) h += 360;
    // Segments: [startHue, endHue, startnm, endnm]
    const segments = [
        [0, 60, 700, 580],
        [60, 120, 580, 530],
        [120, 180, 530, 490],
        [180, 240, 490, 460],
        [240, 300, 460, 400],
        [300, 360, 400, 700]
    ];
    for (let seg of segments) {
        const [h1, h2, nm1, nm2] = seg;
        if (h >= h1 && h <= h2) {
            const ratio = (h - h1) / (h2 - h1);
            return Math.round(nm1 + (nm2 - nm1) * ratio);
        }
    }
    return 0;
}

// Render Polar Plot
function renderPolar() {
    const data = state.data;
    // interpret the slider "fixedS" as "fixedV" for background brightness
    const fixedV = state.fixedS;
    const isLight = document.body.classList.contains('light-mode');

    const textColor = isLight ? '#000' : 'white';
    const axisColor = isLight ? '#000' : '#ccc';
    const gridColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)';
    const isLightBg = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.5)';

    const bgImage = generateGradientImage(fixedV);

    const hoverTexts = data.map(d => {
        const absHue = (d.h + 180) % 360;
        const wl = calculateWavelength(absHue);
        return `No.${d.id}<br>H: ${d.h.toFixed(1)}°<br>S: ${(d.s * 100).toFixed(1)}%<br>V: ${d.v.toFixed(2)}<br>Abs: ${wl}nm`;
    });

    const traceData = {
        type: 'scatterpolar',
        r: data.map(d => d.s), // Use Saturation as Radius
        theta: data.map(d => d.h),
        mode: 'markers+text',
        marker: {
            color: data.map(d => d.hex),
            size: data.map(d => (state.highlightedId && state.highlightedId.toString() === d.id.toString()) ? 22 : 14),
            line: {
                color: data.map(d => {
                    if (state.highlightedId && state.highlightedId.toString() === d.id.toString()) return '#FFD700'; // Highlight Gold
                    if (d.id.toString().startsWith('Cap')) return '#00FF00'; // Capture Green
                    return '#ffffff'; // Default White
                }),
                width: data.map(d => (state.highlightedId && state.highlightedId.toString() === d.id.toString()) ? 4 : 2)
            }
        },
        text: data.map(d => `${d.id}`),
        textposition: 'top center',
        textfont: {
            color: textColor,
            size: 11,
            family: 'Inter, sans-serif',
            weight: 'bold',
        },
        hoverinfo: 'text',
        hovertext: hoverTexts
    };

    // Wavelength Annotations
    // ... (Use existing markers logic)
    const wavelengthMarkers = [
        { label: "700nm", hue: 0, color: "#ff4444" },
        { label: "580nm", hue: 60, color: "#ffff00" },
        { label: "530nm", hue: 120, color: "#44ff44" },
        { label: "490nm", hue: 180, color: "#00ffff" },
        { label: "460nm", hue: 240, color: "#4444ff" },
        { label: "400nm", hue: 300, color: "#ff00ff" }
    ];

    const plotContainer = document.getElementById('polarPlot');
    const rect = plotContainer.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 400;
    const minDim = Math.min(width, height);

    const marginSize = 70;
    const layoutMargins = marginSize * 2;
    const plotDiameter = minDim - layoutMargins;
    const bgSizePx = plotDiameter * 1.12;
    const paperW = width - layoutMargins;
    const paperH = height - layoutMargins;
    const safePaperW = Math.max(paperW, 1);
    const safePaperH = Math.max(paperH, 1);
    const bgSizex = bgSizePx / safePaperW;
    const bgSizey = bgSizePx / safePaperH;
    const labelRadiusPx = (plotDiameter / 2) * 1.30;
    const rX = labelRadiusPx / width;
    const rY = labelRadiusPx / height;

    const annotations = wavelengthMarkers.map(m => {
        const rad = -m.hue * (Math.PI / 180);
        const x = 0.5 + rX * Math.cos(rad);
        const y = 0.5 + rY * Math.sin(rad);

        let xanchor = 'center';
        let yanchor = 'middle';
        if (Math.abs(Math.cos(rad)) > 0.3) {
            xanchor = Math.cos(rad) > 0 ? 'left' : 'right';
        }
        if (Math.abs(Math.sin(rad)) > 0.3) {
            yanchor = y > 0.5 ? 'bottom' : 'top';
        }

        const annotTextColor = isLight ? '#000' : m.color;

        return {
            x: x, y: y,
            xref: 'paper', yref: 'paper',
            text: `<b>${m.label}</b>`,
            showarrow: false,
            xanchor: xanchor, yanchor: yanchor,
            font: { size: 13, color: annotTextColor, family: 'Inter, monospace' },
            bgcolor: isLightBg,
            borderpad: 2,
            bordercolor: m.color,
            borderwidth: 2,
            rx: 3
        };
    });

    annotations.push({
        x: 0.5, y: 1.15,
        xref: 'paper', yref: 'paper',
        text: 'Hue (Angle) / Saturation (Radius)',
        showarrow: false,
        font: { size: 14, color: axisColor, weight: 'bold' }
    });

    const layout = {
        polar: {
            bgcolor: 'rgba(0,0,0,0)',
            radialaxis: {
                range: [0, 1],
                visible: true,
                showgrid: true,
                gridcolor: gridColor,
                tickfont: { color: axisColor },
                layer: 'above traces'
            },
            angularaxis: {
                direction: 'clockwise',
                rotation: 0,
                visible: true,
                showgrid: true,
                gridcolor: gridColor,
                tickfont: { color: axisColor },
                layer: 'above traces'
            }
        },
        images: [
            {
                source: bgImage,
                xref: 'paper', yref: 'paper',
                x: 0.5, y: 0.5,
                sizex: bgSizex, sizey: bgSizey,
                xanchor: 'center', yanchor: 'middle',
                layer: 'below'
            }
        ],
        annotations: annotations,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 70, b: 70, l: 70, r: 70 },
        showlegend: false,
        font: { color: textColor }
    };

    Plotly.newPlot('polarPlot', [traceData], layout, { responsive: true });
}

// Render Table
function renderTable() {
    const dataTableBody = document.querySelector('#dataTable tbody');
    if (!dataTableBody) return;

    dataTableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.data.forEach(d => {
        const tr = document.createElement('tr');
        tr.dataset.id = d.id; // Store ID for highlighting logic

        // Click to highlight
        tr.addEventListener('click', (e) => {
            // Avoid conflict with delete button or content editable
            if (e.target.tagName === 'BUTTON' || e.target.isContentEditable) return;
            highlightData(d.id);
        });

        const dot = `<span class="color-dot" style="background-color: ${d.hex};"></span>${d.hex}`;

        const obsLambda = calculateWavelength(d.h);
        const absLambda = calculateWavelength((d.h + 180) % 360);

        tr.innerHTML = `
            <td contenteditable="true" onblur="window.updateDataId('${d.id}', this.innerText)" style="background: rgba(255,255,255,0.05); cursor: text;">${d.id}</td>
            <td>${dot}</td>
            <td>${d.r}</td><td>${d.g}</td><td>${d.b}</td>
            <td>${d.h.toFixed(1)}</td>
            <td>${(d.s * 100).toFixed(1)}</td>
            <td>${obsLambda > 0 ? obsLambda + 'nm' : '-'}</td>
            <td><b>${absLambda > 0 ? absLambda + 'nm' : '-'}</b></td>
            <td><button class="btn-delete" onclick="window.deleteData('${d.id}')">×</button></td>
        `;
        fragment.appendChild(tr);
    });
    dataTableBody.appendChild(fragment);
}

// Highlight Data Logic
window.highlightData = function (id) {
    // 1. Highlight Table Row
    document.querySelectorAll('#dataTable tbody tr').forEach(tr => {
        if (tr.dataset.id.toString() === id.toString()) {
            tr.classList.add('highlighted-row');
            tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            tr.classList.remove('highlighted-row');
        }
    });

    // 2. Highlight Polar Plot (re-render with highlight state)
    // To avoid full re-render flickering, we could use Plotly.restyle but logic is complex with colors.
    // For now, let's update state to track highlighted ID and re-render.
    state.highlightedId = id;
    renderPolar();
};

// Update ID
window.updateDataId = function (oldId, newId) {
    if (oldId === newId) return;
    const idx = state.data.findIndex(d => d.id.toString() === oldId.toString());
    if (idx !== -1) {
        state.data[idx].id = newId;
        renderAll();
    }
};

// Global Delete Function
window.deleteData = function (id) {
    state.data = state.data.filter(d => d.id.toString() !== id.toString());
    if (state.highlightedId === id) state.highlightedId = null;
    renderAll();
};

// Export to CSV
function exportCSV() {
    if (state.data.length === 0) {
        alert("No data to export.");
        return;
    }
    const headers = ["No", "R", "G", "B", "Hue", "Saturation", "Observed Lambda (nm)", "Absorbed Lambda (nm)", "Hex"];
    const rows = state.data.map(d => {
        const obsLambda = calculateWavelength(d.h);
        const absLambda = calculateWavelength((d.h + 180) % 360);
        return [
            d.id, d.r, d.g, d.b, d.h.toFixed(2), (d.s * 100).toFixed(2),
            obsLambda || "", absLambda || "", d.hex
        ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
    const link = document.createElement("a");
    // Link CSV download
    link.href = encodeURI(csvContent);
    link.download = "hsv_experiment_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Sort Data
window.sortTable = function (key) {
    const { sortState, data } = state;

    // Toggle direction
    if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = key;
        sortState.dir = 'asc';
    }

    const dirVal = sortState.dir === 'asc' ? 1 : -1;

    data.sort((a, b) => {
        let valA, valB;

        // Custom getters for special columns
        if (key === 'obs') {
            valA = calculateWavelength(a.h);
            valB = calculateWavelength(b.h);
        } else if (key === 'abs') {
            valA = calculateWavelength((a.h + 180) % 360);
            valB = calculateWavelength((b.h + 180) % 360);
        } else if (key === 'id') { // Alphanumeric sort for ID
            valA = a.id.toString();
            valB = b.id.toString();
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * dirVal;
        } else {
            valA = a[key];
            valB = b[key];
        }

        if (valA < valB) return -1 * dirVal;
        if (valA > valB) return 1 * dirVal;
        return 0;
    });

    renderAll();
    updateSortIcons();
};

function updateSortIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === state.sortState.key) {
            th.classList.add(state.sortState.dir);
        }
    });
}

// Init Sort Listeners (Called once or safe to recall)
function initSortListeners() {
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(th => {
        // Remove old listeners to be safe? 
        // Simple way: just overwrite onclick or use a flag. 
        // Here we rely on this being called once on load.
        th.onclick = () => sortTable(th.dataset.sort);
    });
}

// Add initSortListeners to DOMContentLoaded (below)}

// Stats Helper
function calculateStats(values) {
    if (!values.length) return { mean: 0, std: 0, n: 0 };
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    return { mean: mean, std: Math.sqrt(variance), n: n };
}

// Gaussian Generator
function generateGaussian(mean, std, min, max, points = 100) {
    if (std === 0) return { x: [], y: [] };
    const x = [];
    const y = [];
    const step = (max - min) / points;
    const factor = 1 / (std * Math.sqrt(2 * Math.PI));
    for (let i = 0; i <= points; i++) {
        const val = min + i * step;
        const prob = factor * Math.exp(-0.5 * Math.pow((val - mean) / std, 2));
        x.push(val);
        y.push(prob);
    }
    return { x, y };
}

// Render Distributions (Observed Lambda, Absorbed Lambda, Hue, Saturation)
function renderDistributions() {
    const data = state.data;
    if (data.length === 0) {
        Plotly.purge('hueDistPlot');
        Plotly.purge('satDistPlot');
        Plotly.purge('hueAngleDistPlot');
        Plotly.purge('saturationDistPlot');
        return;
    }

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#24292f' : '#e6edf3';
    // Darker grid/lines for explicit axis visibility in light mode
    const gridColor = isLight ? '#d0d7de' : '#333';
    const axisLineColor = isLight ? '#24292f' : '#555';
    const fitLineColor = isLight ? '#555555' : '#ffffff';

    const obsVals = data.map(d => calculateWavelength(d.h)).filter(v => v > 0);
    const absVals = data.map(d => calculateWavelength((d.h + 180) % 360)).filter(v => v > 0);
    const hueVals = data.map(d => d.h);
    const satVals = data.map(d => d.s * 100);

    const renderSingleDist = (divId, values, color, xLabel) => {
        if (values.length === 0) return;
        const stats = calculateStats(values);
        // Add padding for nicer visualization
        const minVal = Math.min(...values) - 10;
        const maxVal = Math.max(...values) + 10;

        const gaussian = generateGaussian(stats.mean, stats.std, minVal, maxVal);

        const traceHist = {
            x: values,
            type: 'histogram',
            histnorm: 'probability density',
            name: 'データ',
            marker: { color: color, line: { color: 'rgba(255,255,255,0.2)', width: 1 } },
            opacity: 0.7,
            xbins: { size: (maxVal - minVal) / 15 } // Approximate auto-binning
        };

        const traceFit = {
            x: gaussian.x,
            y: gaussian.y,
            type: 'scatter',
            mode: 'lines',
            name: '正規分布近似',
            line: { color: fitLineColor, width: 2, dash: 'dash' }
        };

        // Unit logic
        let unit = '';
        if (xLabel.includes('nm')) unit = 'nm';
        else if (xLabel.includes('%')) unit = '%';
        else if (divId.includes('hueAngle')) unit = '°';

        const layout = {
            xaxis: {
                title: xLabel,
                titlefont: { weight: 'bold' },
                gridcolor: gridColor,
                zerolinecolor: gridColor,
                showline: true,
                linecolor: axisLineColor,
                linewidth: 1,
                mirror: true
            },
            yaxis: {
                title: '確率密度',
                titlefont: { weight: 'bold' },
                gridcolor: gridColor,
                zerolinecolor: gridColor,
                showline: true,
                linecolor: axisLineColor,
                linewidth: 1,
                mirror: true
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 40, b: 40, l: 60, r: 20 },
            font: { color: textColor },
            showlegend: false,
            annotations: [
                {
                    x: 1, y: 1, xref: 'paper', yref: 'paper',
                    text: `<b>統計量</b><br>平均値: ${stats.mean.toFixed(1)}${unit}<br>標準偏差: ${stats.std.toFixed(2)}<br>サンプル数: ${stats.n}`,
                    showarrow: false,
                    align: 'left',
                    bgcolor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)',
                    bordercolor: isLight ? '#ccc' : '#555',
                    borderwidth: 1,
                    borderpad: 4,
                    font: { size: 12, color: textColor }
                }
            ]
        };
        Plotly.newPlot(divId, [traceHist, traceFit], layout, { responsive: true });
    };

    renderSingleDist('hueDistPlot', obsVals, '#FF4B4B', '波長 (nm)');
    renderSingleDist('satDistPlot', absVals, '#1F77B4', '波長 (nm)');
    renderSingleDist('hueAngleDistPlot', hueVals, '#FFA500', '色相角 (Degree)');
    renderSingleDist('saturationDistPlot', satVals, '#9370DB', '彩度 (%)');
}



function renderAll() {
    renderPolar();
    renderTable();
    renderDistributions();
}

// Indicator definitions and data generation
const indicators = {
    anthocyanin: {
        name: "Anthocyanin",
        type: "custom",
        label: "pH"
    },
    mo: {
        name: "Methyl Orange",
        type: "ph",
        min: 2.0, max: 5.5, step: 0.25,
        transition: [3.1, 4.4],
        hsvStart: [0, 0.9, 1.0], hsvEnd: [60, 1.0, 1.0]
    },
    mr: {
        name: "Methyl Red",
        type: "ph",
        min: 3.5, max: 7.0, step: 0.25,
        transition: [4.2, 6.2],
        hsvStart: [0, 0.9, 1.0], hsvEnd: [55, 1.0, 1.0]
    },
    bcp: {
        name: "Bromocresol Purple",
        type: "ph",
        min: 4.5, max: 7.5, step: 0.25,
        transition: [5.2, 6.8],
        hsvStart: [60, 1.0, 1.0], hsvEnd: [270, 0.8, 0.9]
    },
    btb: {
        name: "BTB Solution",
        type: "ph",
        min: 5.0, max: 8.5, step: 0.25,
        transition: [6.0, 7.6],
        hsvStart: [60, 1.0, 1.0], hsvEnd: [240, 1.0, 1.0]
    },
    pr: {
        name: "Phenol Red",
        type: "ph",
        min: 6.0, max: 9.0, step: 0.25,
        transition: [6.8, 8.4],
        hsvStart: [60, 1.0, 1.0], hsvEnd: [360, 1.0, 1.0]
    },
    pp: {
        name: "Phenolphthalein",
        type: "ph",
        min: 7.0, max: 10.5, step: 0.25,
        transition: [8.0, 9.8],
        hsvStart: [330, 0.0, 1.0], hsvEnd: [330, 1.0, 1.0]
    },
    dpd: {
        name: "DPD Method",
        type: "concentration",
        unit: "mg/L",
        min: 0.0, max: 2.0, step: 0.2,
        hsvStart: [310, 0.0, 1.0], hsvEnd: [310, 0.8, 1.0]
    }
};

// Interpolate in HSV space
function interpolateHSV(hsv1, hsv2, t) {
    if (!hsv1 || !hsv2) return [0, 0, 0];
    let h1 = hsv1[0] || 0, s1 = hsv1[1] || 0, v1 = hsv1[2] || 0;
    let h2 = hsv2[0] || 0, s2 = hsv2[1] || 0, v2 = hsv2[2] || 0;

    // Hue interpolation (shortest path)

    // Hue interpolation (shortest path)
    let dH = h2 - h1;
    if (dH > 180) dH -= 360;
    if (dH < -180) dH += 360;

    let h = h1 + dH * t;
    if (h < 0) h += 360;
    if (h >= 360) h -= 360;

    let s = s1 + (s2 - s1) * t;
    let v = v1 + (v2 - v1) * t;

    return [h, s, v];
}

// Render Captured Image List
function renderImageList() {
    const container = document.getElementById('capturedImageList');
    if (!container) return;

    container.innerHTML = '';
    state.images.forEach(imgData => {
        const thumb = document.createElement('div');
        thumb.style.minWidth = '60px';
        thumb.style.height = '60px';
        thumb.style.backgroundImage = `url(${imgData.src})`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.border = '2px solid white';
        thumb.style.borderRadius = '4px';
        thumb.style.cursor = 'pointer';
        thumb.title = `Captured at ${new Date(imgData.id).toLocaleTimeString()}`;

        // Re-open modal on click
        thumb.addEventListener('click', () => {
            const imageModal = document.getElementById('imageModal');
            const imgCanvas = document.getElementById('imgCanvas');
            const imgContext = imgCanvas.getContext('2d');

            const img = new Image();
            img.onload = () => {
                const maxW = window.innerWidth * 0.9;
                const maxH = window.innerHeight * 0.8;
                let w = img.width;
                let h = img.height;
                const scale = Math.min(maxW / w, maxH / h);
                w *= scale;
                h *= scale;
                imgCanvas.width = w;
                imgCanvas.height = h;
                imgContext.drawImage(img, 0, 0, w, h);

                // Restore Markers
                state.currentImageId = imgData.id;
                if (imgData.markers) {
                    imgData.markers.forEach(m => {
                        imgContext.strokeStyle = '#00FF00';
                        imgContext.lineWidth = 3;
                        imgContext.strokeRect(m.x, m.y, m.w, m.h);

                        imgContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        imgContext.fillRect(m.x, m.y - 20, 60, 20);

                        imgContext.fillStyle = '#FFFFFF';
                        imgContext.font = '12px Arial';
                        imgContext.fillText(m.label, m.x + 2, m.y - 5);
                    });
                }

                imageModal.style.display = 'flex';
            };
            img.src = imgData.src;
        });

        container.appendChild(thumb);
    });
}


function generateAnthocyaninData() {
    // 14 steps typical for pH 1 to 14
    const phColors = [
        { ph: 1, r: 255, g: 10, b: 20 },
        { ph: 2, r: 255, g: 30, b: 40 },
        { ph: 3, r: 240, g: 40, b: 80 },
        { ph: 4, r: 220, g: 50, b: 120 },
        { ph: 5, r: 180, g: 60, b: 180 },
        { ph: 6, r: 140, g: 70, b: 210 },
        { ph: 7, r: 100, g: 80, b: 240 },
        { ph: 8, r: 60, g: 100, b: 230 },
        { ph: 9, r: 30, g: 160, b: 200 },
        { ph: 10, r: 20, g: 180, b: 160 },
        { ph: 11, r: 30, g: 200, b: 100 },
        { ph: 12, r: 100, g: 220, b: 50 },
        { ph: 13, r: 180, g: 230, b: 30 },
        { ph: 14, r: 220, g: 240, b: 20 }
    ];
    return phColors.map(c => ({
        val: c.ph,
        r: c.r, g: c.g, b: c.b,
        label: `pH${c.ph}`
    }));
}

function generateTestData() {
    console.log("generateTestData called");
    const typeSelect = document.getElementById('testDataSelect');
    if (!typeSelect) {
        console.error("testDataSelect element not found");
        return;
    }
    const type = typeSelect.value;
    console.log("Selected type:", type);

    const config = indicators[type];
    if (!config) {
        console.error("Configuration not found for type:", type);
        return;
    }

    // Clear existing data first
    state.data = [];

    let rawData = [];
    const noise = 8; // Reduce noise slightly for cleaner look

    if (type === 'anthocyanin') {
        rawData = generateAnthocyaninData();
    } else if (config.type === 'ph' || config.type === 'concentration') {
        const isPh = config.type === 'ph';
        const start = config.min;
        const end = config.max;
        const step = config.step;

        for (let val = start; val <= end; val += step) {
            let t = 0;
            if (isPh) {
                if (val <= config.transition[0]) t = 0;
                else if (val >= config.transition[1]) t = 1;
                else t = (val - config.transition[0]) / (config.transition[1] - config.transition[0]);
            } else {
                t = (val - config.min) / (config.max - config.min);
            }

            // Interpolate in HSV
            const hsv = interpolateHSV(config.hsvStart, config.hsvEnd, t);
            // Convert back to RGB for noise addition, as simulate sensor noise
            const rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]);

            rawData.push({
                val: parseFloat(val.toFixed(2)),
                r: rgb[0], g: rgb[1], b: rgb[2],
                label: isPh ? `pH${val.toFixed(1)}` : `${val.toFixed(1)}${config.unit}`
            });
        }
    }

    // Process and add noise
    const processedData = rawData.map(d => {
        const rNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;
        const gNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;
        const bNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;

        const r = Math.max(0, Math.min(255, d.r + rNoise));
        const g = Math.max(0, Math.min(255, d.g + gNoise));
        const b = Math.max(0, Math.min(255, d.b + bNoise));
        const hsv = rgbToHsv(r, g, b);

        return {
            id: d.label,
            r, g, b,
            h: hsv.h, s: hsv.s, v: hsv.v,
            hex: rgbToHex(r, g, b)
        };
    });

    state.data = processedData;
    renderAll();
}


// Event Listeners and Initialization
document.addEventListener('DOMContentLoaded', () => {
    // --- Image Input Logic ---
    const imageInput = document.getElementById('imageInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const imageModal = document.getElementById('imageModal');
    const imgCanvas = document.getElementById('imgCanvas');
    const closeModalBtn = document.getElementById('closeModalBtn');

    let imgContext = null;
    if (imgCanvas) {
        imgContext = imgCanvas.getContext('2d');
    }

    if (uploadBtn && imageInput) {
        uploadBtn.addEventListener('click', () => {
            console.log("Upload button clicked");
            imageInput.click();
        });

        imageInput.addEventListener('change', (e) => {
            console.log("File input changed");
            if (e.target.files && e.target.files[0]) {
                console.log("File selected:", e.target.files[0].name);
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const img = new Image();
                    img.onload = () => {
                        console.log("Image loaded, opening modal");
                        // Fit to modal
                        const maxW = window.innerWidth * 0.9;
                        const maxH = window.innerHeight * 0.8;
                        let w = img.width;
                        let h = img.height;

                        const scale = Math.min(maxW / w, maxH / h);
                        w *= scale;
                        h *= scale;

                        imgCanvas.width = w;
                        imgCanvas.height = h;
                        imgContext.drawImage(img, 0, 0, w, h);
                        imageModal.style.display = 'flex';


                        // Save image to state and render thumbnail
                        const thumbSrc = img.src; // Data URL
                        const newImgId = Date.now();
                        const newImgObj = { id: newImgId, src: thumbSrc, markers: [] };
                        state.currentImageId = newImgId;
                        state.images.unshift(newImgObj); // Add to front
                        renderImageList();
                    };
                    img.onerror = (err) => {
                        console.error("Error loading image object:", err);
                        alert("Failed to load image.");
                    };
                    img.src = evt.target.result;
                };
                reader.onerror = (err) => {
                    console.error("FileReader error:", err);
                    alert("Error reading file.");
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    if (closeModalBtn && imageModal) {
        closeModalBtn.addEventListener('click', () => {
            imageModal.style.display = 'none';
            if (imageInput) imageInput.value = '';
        });
    }

    if (imgCanvas && imgContext) {
        imgCanvas.addEventListener('click', (e) => {
            const rect = imgCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const size = 10;
            const sx = Math.max(0, x - size / 2);
            const sy = Math.max(0, y - size / 2);
            const sw = Math.min(imgCanvas.width - sx, size);
            const sh = Math.min(imgCanvas.height - sy, size);

            const imgData = imgContext.getImageData(sx, sy, sw, sh);
            const data = imgData.data;
            let rSum = 0, gSum = 0, bSum = 0, count = 0;

            for (let i = 0; i < data.length; i += 4) {
                rSum += data[i];
                gSum += data[i + 1];
                bSum += data[i + 2];
                count++;
            }

            const r = Math.round(rSum / count);
            const g = Math.round(gSum / count);
            const b = Math.round(bSum / count);

            // 1. Set Inputs
            if (inputR && inputG && inputB) {
                inputR.value = r;
                inputG.value = g;
                inputB.value = b;
                state.currentSource = 'Cap'; // Set source to Capture
                if (typeof updatePreview === 'function') updatePreview();
            }

            // 2. Auto-Add Data to get ID
            const newId = addData();

            // 3. Draw Highlight (Green Box) + Label
            const marker = { x: sx, y: sy, w: sw, h: sh, label: newId };

            // Save marker to current image state
            if (state.currentImageId) {
                const currentImg = state.images.find(img => img.id === state.currentImageId);
                if (currentImg) {
                    currentImg.markers.push(marker);
                }
            }

            // Draw Helper
            const drawMarker = (m) => {
                imgContext.strokeStyle = '#00FF00';
                imgContext.lineWidth = 3;
                imgContext.strokeRect(m.x, m.y, m.w, m.h);

                imgContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
                imgContext.fillRect(m.x, m.y - 20, 60, 20);

                imgContext.fillStyle = '#FFFFFF';
                imgContext.font = '12px Arial';
                imgContext.fillText(m.label, m.x + 2, m.y - 5);
            };

            drawMarker(marker);

            // Modal remains open for multiple storage
        });
    }

    // Main Control Listeners
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            try {
                if (typeof generateTestData === 'function') {
                    generateTestData();
                } else {
                    console.error("generateTestData function not found in scope");
                }
            } catch (err) {
                console.error("Error generating data:", err);
                alert(`Error: ${err.message}. Check console for details.`);
            }
        });
    }

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportCSV);
    }

    if (addDataBtn) addDataBtn.addEventListener('click', addData);
    if (clearBtn) clearBtn.addEventListener('click', clearData);

    [inputR, inputG, inputB].forEach(el => {
        if (el) el.addEventListener('input', () => {
            state.currentSource = 'Input'; // Reset to Input on manual edit
            updatePreview();
        });
    });

    if (fixedSInput) {
        fixedSInput.addEventListener('input', (e) => {
            state.fixedS = parseFloat(e.target.value);
            fixedSVal.textContent = state.fixedS.toFixed(2);
            renderPolar();
        });
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('light-mode');
            } else {
                document.body.classList.remove('light-mode');
            }
            renderAll();
        });
    }

    // Initial Render
    if (typeof updatePreview === 'function') updatePreview();
    if (typeof renderAll === 'function') renderAll();

    // Initialize Sort Listeners
    initSortListeners();

    // Layout Init
    updateLayout();
    window.addEventListener('resize', updateLayout);
    const layoutRadios = document.querySelectorAll('input[name="layoutMode"]');
    layoutRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.layoutMode = e.target.value;
            updateLayout();
            // Also force sidebar open/close reset?
            // If switching to PC, ensure sidebar is visible (mobile menu toggle hides it offscreen potentially)
            // Actually, mobile css hides it. PC styles show it.
            // But if sidebar had 'open' class maybe remove it?
            if (e.target.value !== 'Mobile') {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.remove('open');
            }
        });
    });

    // Mobile Menu Toggle Logic
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    function toggleSidebar(forceClose = false) {
        if (!sidebar) return;

        const isOpen = sidebar.classList.contains('open');
        const shouldClose = forceClose || isOpen;

        if (shouldClose) {
            sidebar.classList.remove('open');
            if (overlay) overlay.style.display = 'none';
            if (menuToggle) menuToggle.textContent = '☰';
        } else {
            sidebar.classList.add('open');
            if (overlay) overlay.style.display = 'block';
            if (menuToggle) menuToggle.textContent = '✕';
        }
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => toggleSidebar());
    }

    if (overlay) {
        overlay.addEventListener('click', () => toggleSidebar(true));
    }
});
