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
    nextId: 1
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

    state.data.push({
        id: state.nextId++,
        r: rC,
        g: gC,
        b: bC,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        hex: rgbToHex(rC, gC, bC)
    });

    renderAll();
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

// Helper: Generate HSV Gradient Image (DataURL)
function generateGradientImage(fixedS, size = 400) {
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
            const dy = cy - y; // Correct Cartesian: Up (y<cy) is Positive.
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Normalize distance to 0..1 (Val) for the chart axis limit
            // But we don't want the BACKGROUND visual to fade to black (V=0) at the center.
            // The user requested "Not a black background".
            // So we use V=1.0 for the visual color, while keeping the circular mask.
            let axisV = dist / radius;

            if (axisV > 1) {
                // Outside circle: transparent
                const idx = (y * size + x) * 4;
                data[idx + 3] = 0;
                continue;
            }

            // Angle in degrees (0..360) from atan2 is naturally CCW
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            // User requested "Reverse rotation" (Clockwise).
            // So we invert the angle for Hue.
            // If Angle=90 (Top), Hue = 270 (Purple).
            // If Angle=270 (Bottom), Hue = 90 (Yellow/Green).
            let h = 360 - angle;
            if (h >= 360) h -= 360;

            const s = fixedS;
            // Visual Brightness
            const visualV = 0.90;

            // Convert to RGB
            const [r, g, b] = chroma.hsv(h, s, visualV).rgb();

            const idx = (y * size + x) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255; // Alpha
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

// Helper: Calculate Exact Wavelength from Hue coordinate (Linear Interpolation)
function calculateWavelength(hue) {
    // Map Hue (0-360) to Wavelength (nm) based on the outer ring anchors
    // 0(Red): 700, 60(Yellow): 580, 120(Green): 530, 
    // 180(Cyan): 490, 240(Blue): 460, 300(Violet): 400, 360(Red): 700

    let h = hue % 360;
    if (h < 0) h += 360;

    // Define segments: [startHue, endHue, startnm, endnm]
    const segments = [
        [0, 60, 700, 580],
        [60, 120, 580, 530],
        [120, 180, 530, 490],
        [180, 240, 490, 460],
        [240, 300, 460, 400],
        [300, 360, 400, 700] // Non-spectral bridge
    ];

    for (let seg of segments) {
        const [h1, h2, nm1, nm2] = seg;
        if (h >= h1 && h <= h2) {
            // Linear Interpolation
            const ratio = (h - h1) / (h2 - h1);
            const nm = nm1 + (nm2 - nm1) * ratio;
            return Math.round(nm);
        }
    }
    return 0;
}

// Render Polar Plot
function renderPolar() {
    const data = state.data;
    const fixedS = state.fixedS;
    const isLight = document.body.classList.contains('light-mode');

    // Improved Contrast Settings for Light Mode
    const textColor = isLight ? '#000' : 'white';
    const axisColor = isLight ? '#000' : '#ccc';
    const gridColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)'; // Darker grid for light mode

    // For annotations in light mode: clear white bg, black text
    const isLightBg = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.5)';

    const bgImage = generateGradientImage(fixedS);

    // Prepare hover text with exact absorbed wavelength info
    const hoverTexts = data.map(d => {
        const absHue = (d.h + 180) % 360;
        const wl = calculateWavelength(absHue);
        return `No.${d.id}<br>H: ${d.h.toFixed(1)}°<br>V: ${d.v.toFixed(2)}<br>Abs: ${wl}nm (${absHue.toFixed(0)}°)`;
    });

    const traceData = {
        type: 'scatterpolar',
        r: data.map(d => d.v),
        theta: data.map(d => d.h),
        mode: 'markers+text',
        marker: {
            color: data.map(d => d.hex),
            size: 14,
            line: {
                color: isLight ? '#555' : 'white', // Darker border in light mode
                width: 2
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

    // Wavelength Annotations (Observed Color Wavelengths)
    const wavelengthMarkers = [
        { label: "700nm", hue: 0, color: "#ff4444" },    // Red
        { label: "580nm", hue: 60, color: "#ffff00" },   // Yellow
        { label: "530nm", hue: 120, color: "#44ff44" },  // Green
        { label: "490nm", hue: 180, color: "#00ffff" },  // Cyan
        { label: "460nm", hue: 240, color: "#4444ff" },  // Blue
        { label: "400nm", hue: 300, color: "#ff00ff" }   // Violet
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

        // Use black text in light mode for readability
        const annotTextColor = isLight ? '#000' : m.color;

        return {
            x: x,
            y: y,
            xref: 'paper',
            yref: 'paper',
            text: `<b>${m.label}</b>`,
            showarrow: false,
            xanchor: xanchor,
            yanchor: yanchor,
            font: {
                size: 13,
                color: annotTextColor,
                family: 'Inter, monospace'
            },
            bgcolor: isLightBg,
            borderpad: 2,
            bordercolor: m.color,
            borderwidth: 2,
            rx: 3
        };
    });

    annotations.push({
        x: 0.5,
        y: 1.15,
        xref: 'paper',
        yref: 'paper',
        text: 'Light Wavelength (nm)',
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
                xref: 'paper',
                yref: 'paper',
                x: 0.5,
                y: 0.5,
                sizex: bgSizex,
                sizey: bgSizey,
                xanchor: 'center',
                yanchor: 'middle',
                layer: 'below'
            }
        ],
        annotations: annotations,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 70, b: 70, l: 70, r: 70 },
        showlegend: false,
        font: { color: textColor } // Use dynamic text color for layout font
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
    link.href = encodeURI(csvContent);
    link.download = "hsv_experiment_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

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

// Generate Anthocyanin pH Data
function generateAnthocyaninData() {
    // 14 steps typical for pH 1 to 14
    // Adjusted to User's spec:
    // Acid: Red (Abs ~520nm -> Green absorbed? No, Red reflects Red. Abs ~520nm is green region. So color is Red.)
    // Neutral: Purple (Abs ~535nm Green. Color is Purple.)
    // Alkaline: Blue-Green (Abs ~580-600nm Orange/Red. Color is Blue/Cyan.)

    const phColors = [
        // Acidic: Red -> Pink
        { ph: 1, r: 255, g: 10, b: 20 },   // Deep Red
        { ph: 2, r: 255, g: 30, b: 40 },   // Red
        { ph: 3, r: 240, g: 40, b: 80 },   // Red-Pink
        { ph: 4, r: 220, g: 50, b: 120 },  // Pink-Purple

        // Weak Acid - Neutral: Purple -> Violet -> Blue
        { ph: 5, r: 180, g: 60, b: 180 },  // Purple
        { ph: 6, r: 140, g: 70, b: 210 },  // Violet
        { ph: 7, r: 100, g: 80, b: 240 },  // Blue-Violet
        { ph: 8, r: 60, g: 100, b: 230 },  // Blue

        // Alkaline: Blue-Green -> Green -> Yellow-Green
        { ph: 9, r: 30, g: 160, b: 200 },  // Blue-Green (Cyan-ish)
        { ph: 10, r: 20, g: 180, b: 160 }, // Green-Blue (Teal)
        { ph: 11, r: 30, g: 200, b: 100 }, // Green
        { ph: 12, r: 100, g: 220, b: 50 }, // Bright Green
        { ph: 13, r: 180, g: 230, b: 30 }, // Yellow-Green
        { ph: 14, r: 220, g: 240, b: 20 }  // Yellowish-Green (Chalcone)
    ];

    const newData = [];
    const noise = 15; // Random fluctuation amount

    phColors.forEach((c) => {
        // Add random noise to simulate experimental deviation
        const rNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;
        const gNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;
        const bNoise = Math.floor(Math.random() * (noise * 2 + 1)) - noise;

        const r = Math.max(0, Math.min(255, c.r + rNoise));
        const g = Math.max(0, Math.min(255, c.g + gNoise));
        const b = Math.max(0, Math.min(255, c.b + bNoise));

        const hsv = rgbToHsv(r, g, b);

        newData.push({
            id: `pH${c.ph}`,
            r: r,
            g: g,
            b: b,
            h: hsv.h,
            s: hsv.s,
            v: hsv.v,
            hex: rgbToHex(r, g, b)
        });
    });

    state.data = newData;
    renderAll();
}

// Event Listeners
const anthocyaninBtn = document.getElementById('anthocyaninBtn');
if (anthocyaninBtn) {
    anthocyaninBtn.addEventListener('click', generateAnthocyaninData);
}

const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCSV);
}

addDataBtn.addEventListener('click', addData);
clearBtn.addEventListener('click', clearData);

[inputR, inputG, inputB].forEach(el => {
    el.addEventListener('input', updatePreview);
});

fixedSInput.addEventListener('input', (e) => {
    state.fixedS = parseFloat(e.target.value);
    fixedSVal.textContent = state.fixedS.toFixed(2);
    renderPolar();
});

// Theme Toggle Logic
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    renderAll();
});

function updateChartTheme() {
    renderAll();
}

// Init
updatePreview();
renderAll();

