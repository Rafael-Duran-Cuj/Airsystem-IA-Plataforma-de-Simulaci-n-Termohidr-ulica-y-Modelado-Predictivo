// app.js - Lógica principal del frontend de AirSystem: gestión de estado, interacción con la API, generación dinámica de campos y gráficos, y manejo de eventos de usuario.

// CONFIGURACIÓN Y ESTADO GLOBAL
const API_URL = '/api';

const appState = {
    modeloIA: null,
    modelosDisponibles: [],
    modeloSeleccionado: null,
    dimensionesActuales: {},
    historialSimulaciones: [],
    ultimaPrediccion: null
};

const CAMPOS_CONFIG = [
    { nombre: "ITD",            label: "ITD",              unidad: "°C",       default: "65"   },
    { nombre: "Va (m/s)",       label: "Va",               unidad: "m/s",      default: "5.9"  },
    { nombre: "Qw (L/m)",       label: "Qw",               unidad: "L/min",    default: "80"   },
    { nombre: "Height (mm)",    label: "Height",           unidad: "mm",       default: "452"  },
    { nombre: "Large (mm)",     label: "Large",            unidad: "mm",       default: "650"  },
    { nombre: "Thickness (mm)", label: "Thickness",        unidad: "mm",       default: "27"   },
    { nombre: "Ntubes",         label: "N° Tubos",         unidad: "Unidades", default: "74"   },
    { nombre: "Theight (mm)",   label: "Tube Height",      unidad: "mm",       default: "1.3"  },
    { nombre: "Fin Height (mm)",label: "Fin Height",       unidad: "mm",       default: "4.7"  },
    { nombre: "Fin Pitch (mm)", label: "Fin Pitch",        unidad: "mm",       default: "0.94" },
    { nombre: "Tube Thick (mm)",label: "Tube Thickness",   unidad: "mm",       default: "0.24" },
    { nombre: "Dimple",         label: "Dimple",           unidad: "0=No 1=Sí",default: "1"    },
];

const CAMPOS_DIMENSIONALES = [
    "Height (mm)", "Large (mm)", "Thickness (mm)", "Ntubes",
    "Theight (mm)", "Fin Height (mm)", "Fin Pitch (mm)",
    "Tube Thick (mm)", "Dimple"
];

const CAMPOS_OPERACIONALES = [
    { nombre: "ITD",      label: "ITD",  unidad: "°C",    default: "65"  },
    { nombre: "Va (m/s)", label: "Va",   unidad: "m/s",   default: "5.9" },
    { nombre: "Qw (L/m)", label: "Qw",   unidad: "L/min", default: "80"  },
];

const VARIABLES_RANGOS = ["ITD", "Va (m/s)", "Qw (L/m)"];

// ═══════════════════════════════════════════════════════════════════
// PALETA DE COLORES
// QITD  → naranja  #f97316   (calor)
// DpAir → verde    #10b981   (caída de presión aire)
// DpW   → azul     #3b82f6   (caída de presión agua)
// ═══════════════════════════════════════════════════════════════════
const COLOR_QITD  = '#f97316';
const COLOR_DPAIR = '#10b981';
const COLOR_DPW   = '#3b82f6';

// ── Factores de seguridad ────────────────────────────────────────
const FACTOR_DPAIR = 1.0;
const FACTOR_DPW   = 1.0; 

function aplicarFactores(resultados) {
    return {
        Qitd:  resultados.Qitd,
        DpAir: resultados.DpAir * FACTOR_DPAIR,
        DpW:   resultados.DpW   * FACTOR_DPW,
    };
}

// ── Tema Plotly compartido ───────────────────────────────────────
const PLOTLY_THEME = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { family: 'Inter, system-ui', color: '#94a3b8', size: 11 },
    xaxis: {
        gridcolor: '#1e293b', zerolinecolor: '#334155',
        linecolor: '#334155', tickfont: { color: '#94a3b8' }
    },
    yaxis: {
        gridcolor: '#1e293b', zerolinecolor: '#334155',
        linecolor: '#334155', tickfont: { color: '#94a3b8' }
    },
    margin: { l: 52, r: 20, t: 44, b: 48 },
    legend: {
        bgcolor: 'rgba(15,23,42,0.8)', bordercolor: '#334155',
        borderwidth: 1, font: { color: '#e2e8f0', size: 10 }
    },
    hoverlabel: {
        bgcolor: '#0f172a', bordercolor: '#3b82f6',
        font: { color: '#f8fafc', size: 12 }
    }
};

const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    displaylogo: false
};

// ── Mapa de etiquetas para el eje X del análisis de rangos ───────
const LABEL_RANGOS = {
    'ITD':      'Diferencia de Temperatura ITD (°C)',
    'Va (m/s)': 'Velocidad de Aire (m/s)',
    'Qw (L/m)': 'Flujo de Agua (L/min)',
};

const RANGOS_SWEEP = [
    { chartId: 'chartRangosQitd',  varX: 'Va (m/s)', labelX: 'Velocidad de Aire (m/s)', yLabel: 'Qitd (W)',      color: COLOR_QITD,  key: 'Qitd'  },
    { chartId: 'chartRangosDpair', varX: 'Va (m/s)', labelX: 'Velocidad de Aire (m/s)', yLabel: 'ΔP Aire (Pa)',  color: COLOR_DPAIR, key: 'DpAir' },
    { chartId: 'chartRangosDpw',   varX: 'Qw (L/m)', labelX: 'Flujo de Agua (L/min)',   yLabel: 'ΔP Agua (mbar)',color: COLOR_DPW,   key: 'DpW'   },
];

// GESTIÓN DE TABS ─────────────────────────────────────────────────

function mostrarTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.closest('.tab-btn').classList.add('active');
    lucide.createIcons();

    if (tabName === 'rangos') {
        Plotly.Plots.resize('chartRangosQitd');
        Plotly.Plots.resize('chartRangosDpair');
        Plotly.Plots.resize('chartRangosDpw');
    }
    if (tabName === 'manual') {
        SENS_CHARTS.forEach((_, idx) => Plotly.Plots.resize(_idSensChart('Manual', idx)));
    }
    if (tabName === 'presets') {
        SENS_CHARTS.forEach((_, idx) => Plotly.Plots.resize(_idSensChart('Preset', idx)));
    }
}

// NOTIFICACIONES ──────────────────────────────────────────────────

function mostrarNotificacion(mensaje, tipo = 'info') {
    const iconos = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    actualizarStatusBar(`${iconos[tipo] || ''} ${mensaje}`);

    const toast = document.getElementById('toastContainer');
    if (!toast) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = mensaje;
    toast.appendChild(el);
    setTimeout(() => { el.classList.add('toast-hide'); }, 2800);
    setTimeout(() => { el.remove(); }, 3300);
}

// CARGA DE ARCHIVOS ───────────────────────────────────────────────

function cargarModeloIA()    { document.getElementById('fileInputIA').click(); }
function cargarExcelExterno(){ document.getElementById('fileInputExcel').click(); }

async function procesarArchivoIA(event) {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        mostrarCargando(true);
        const res  = await fetch(`${API_URL}/cargar-modelo`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            appState.modeloIA = data.modelo;
            document.getElementById('statusIA').textContent  = 'Conectado';
            document.getElementById('dotIA').className       = 'dot success';
            mostrarNotificacion(`Modelo cargado: ${file.name}`, 'success');
            actualizarStatusBar(`IA activa: ${file.name} | ${data.info || ''}`);
        } else {
            throw new Error(data.error || 'Error al cargar el modelo');
        }
    } catch (e) {
        mostrarNotificacion(`Error: ${e.message}`, 'error');
        document.getElementById('dotIA').className = 'dot danger';
    } finally {
        mostrarCargando(false);
        event.target.value = '';
    }
}

async function procesarArchivoExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        mostrarCargando(true);
        const res  = await fetch(`${API_URL}/cargar-excel`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            mostrarNotificacion(`+${data.modelos_agregados} modelos externos cargados`, 'success');
            await cargarModelosDisponibles();
        } else throw new Error(data.error);
    } catch (e) {
        mostrarNotificacion(`Error: ${e.message}`, 'error');
    } finally {
        mostrarCargando(false);
        event.target.value = '';
    }
}

// MODELOS DISPONIBLES ─────────────────────────────────────────────

async function cargarModelosDisponibles() {
    try {
        console.log('Llamando /api/modelos con credentials...');
        const res = await _fetchOriginal(`${API_URL}/modelos`, { 
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Respuesta /api/modelos:', res.status);
        const data = await res.json();
        if (data.success) {
            appState.modelosDisponibles = data.modelos;
            actualizarComboModelos();
            document.getElementById('statusModelos').textContent = data.modelos.length;
        }
    } catch (e) { console.error('Error al cargar modelos:', e); }
}

function actualizarComboModelos() {
    const combo = document.getElementById('comboModelos');
    combo.innerHTML = '<option value="">Seleccione un modelo...</option>';
    appState.modelosDisponibles.forEach(m => {
        const o = document.createElement('option');
        o.value = o.textContent = m;
        combo.appendChild(o);
    });
    if (appState.modelosDisponibles.length > 0) {
        combo.value = appState.modelosDisponibles[0];
        autoLlenarPreset();
    }
}

async function actualizarListaModelos() {
    await cargarModelosDisponibles();
    mostrarNotificacion('Lista de modelos actualizada', 'info');
    lucide.createIcons();
}

// GENERACIÓN DE CAMPOS DINÁMICOS ──────────────────────────────────
function generarCamposManual() {
    const form = document.getElementById('formManual');
    CAMPOS_CONFIG.forEach(c => {
        const div = document.createElement('div');
        div.className = 'field-group';
        const lbl = document.createElement('label');
        lbl.textContent = `${c.label ?? c.nombre} (${c.unidad})`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any';
        inp.id = `manual-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`;
        inp.value = c.default;
        div.appendChild(lbl); div.appendChild(inp);
        form.appendChild(div);
    });
}

function generarCamposPresets() {
    const dimDiv = document.getElementById('dimensionesModelo');
    CAMPOS_DIMENSIONALES.forEach(c => {
        const item = document.createElement('div'); item.className = 'spec-item';
        const lbl  = document.createElement('span'); lbl.className = 'spec-label'; lbl.textContent = c;
        const val  = document.createElement('span'); val.className = 'spec-value';
        val.id = `preset-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`; val.textContent = '---';
        item.appendChild(lbl); item.appendChild(val); dimDiv.appendChild(item);
    });

    const opDiv = document.getElementById('operacionalesPreset');
    CAMPOS_OPERACIONALES.forEach(c => {
        const div = document.createElement('div'); div.className = 'field-group';
        const lbl = document.createElement('label'); 
        lbl.textContent = `${c.label ?? c.nombre} (${c.unidad})`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any';
        inp.id = `preset-op-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`; inp.value = c.default;
        div.appendChild(lbl); div.appendChild(inp); opDiv.appendChild(div);
    });
}

function generarCamposRangos() {
    const dimDiv = document.getElementById('dimensionesRangos');
    CAMPOS_DIMENSIONALES.forEach(c => {
        const item = document.createElement('div'); item.className = 'snapshot-item';
        const lbl  = document.createElement('span'); lbl.className = 'snapshot-label'; lbl.textContent = c;
        const val  = document.createElement('span'); val.className = 'snapshot-value';
        val.id = `rangos-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`; val.textContent = '---';
        item.appendChild(lbl); item.appendChild(val); dimDiv.appendChild(item);
    });

    const tbody = document.getElementById('rangosTableBody');
    VARIABLES_RANGOS.forEach(v => {
        const tr  = document.createElement('tr');
        const vid = v.replace(/[^a-zA-Z0-9]/g, '');
        tr.innerHTML = `
            <td>${v}</td>
            <td><input type="number" step="any" placeholder="Min" id="rango-${vid}-min" oninput="actualizarPreviewRango('${v}')"></td>
            <td><input type="number" step="any" placeholder="Max" id="rango-${vid}-max" oninput="actualizarPreviewRango('${v}')"></td>
            <td><input type="number" min="2" placeholder="Steps" id="rango-${vid}-steps" oninput="actualizarPreviewRango('${v}')"></td>
            <td><span class="preview-range" id="rango-${vid}-preview">---</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// GRÁFICAS DE SENSIBILIDAD─────────────────────────────────────────
const SENS_CHARTS = [
    {
        varX:      'Va (m/s)',         
        labelX:    'Velocidad de Aire (m/s)',
        varY:      'Qitd',
        labelY:    'Qitd (W)',
        color:     COLOR_QITD,
        delta:     0.30,
        minDelta:  0.3,                
    },
    {
        varX:      'Va (m/s)',
        labelX:    'Velocidad de Aire (m/s)',
        varY:      'DpAir',
        labelY:    'ΔP Aire (Pa)',
        color:     COLOR_DPAIR,
        delta:     0.30,
        minDelta:  0.5,
    },
    {
        varX:      'Qw (L/m)',
        labelX:    'Flujo de Agua (L/min)',
        varY:      'DpW',
        labelY:    'ΔP Agua (mbar)',
        color:     COLOR_DPW,
        delta:     0.50,
        minDelta:  5.0,              
    },
];


function _idSensChart(tabPrefix, idx) {
    return `${tabPrefix}Sens${idx}`;
}

function inicializarGraficasSensibilidad() {
    ['Manual', 'Preset'].forEach(tab => {
        const tabL    = tab.toLowerCase();
        // El tab de Presets tiene id="tab-presets"
        const tabId   = tabL === 'preset' ? 'tab-presets' : `tab-${tabL}`;
        const section = document.querySelector(`#${tabId} .chart-section`);
        if (!section) return;

        const h3 = section.querySelector('h3');
        if (h3) h3.textContent = 'Curvas de Sensibilidad Local';

        section.querySelectorAll('.sens-chart-wrapper').forEach(el => el.remove());
        const old = section.querySelector('.plotly-chart');
        if (old) old.remove();

        SENS_CHARTS.forEach((cfg, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'sens-chart-wrapper';

            const label = document.createElement('p');
            label.className = 'sens-curve-label';
            label.style.color = cfg.color;
            label.textContent = `${cfg.labelX}  →  ${cfg.labelY}`;

            const div = document.createElement('div');
            div.id        = _idSensChart(tab, idx);
            div.className = 'plotly-chart';

            wrapper.appendChild(label);
            wrapper.appendChild(div);
            section.appendChild(wrapper);

            Plotly.newPlot(div.id, [], {
                ...PLOTLY_THEME,
                margin: { l: 52, r: 20, t: 20, b: 48 },
                xaxis: {
                    ...PLOTLY_THEME.xaxis,
                    title: { text: cfg.labelX, font: { color: '#64748b', size: 10 } }
                },
                yaxis: {
                    ...PLOTLY_THEME.yaxis,
                    title: { text: cfg.labelY, font: { color: '#64748b', size: 10 } }
                },
                annotations: [{
                    text: 'Ejecuta una predicción para ver la curva',
                    xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
                    showarrow: false, font: { color: '#334155', size: 13 }
                }]
            }, PLOTLY_CONFIG);
        });
    });
}

/**
 * @param {Object} valoresBase  
 * @param {string} tabPrefix
 */
async function calcularYGraficarSensibilidad(valoresBase, tabPrefix) {
    if (!appState.modeloIA) return;

    for (let idx = 0; idx < SENS_CHARTS.length; idx++) {
        const cfg          = SENS_CHARTS[idx];
        const chartId      = _idSensChart(tabPrefix, idx);
        const valorCentral = parseFloat(valoresBase[cfg.varX]);
        const delta        = Math.max(valorCentral * cfg.delta, cfg.minDelta);
        const numPuntos    = cfg.numPuntos ?? 13;   // ← DpW usa 17, los demás 13
        const puntos       = linspace(valorCentral - delta, valorCentral + delta, numPuntos);

        const xs = [], ys = [];
        let yCenter = null;

        for (const v of puntos) {
            const vars = { ...valoresBase, [cfg.varX]: v };
            try {
                const res  = await fetch(`${API_URL}/simular`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ valores: vars })
                });
                const data = await res.json();
                if (data.success) {
                    const r = aplicarFactores(data.resultados);
                    xs.push(v);
                    ys.push(r[cfg.varY]);
                    if (Math.abs(v - valorCentral) < 1e-9) yCenter = r[cfg.varY];
                }
            } catch (_) {}
        }

        const yCtr = yCenter ?? ys[Math.floor(ys.length / 2)];

        const traces = [
            {
                x: xs, y: ys,
                mode: 'lines+markers',
                line:      { color: cfg.color, width: 2.5, shape: 'spline' },
                marker:    { color: cfg.color, size: 5 },
                fill:      'tozeroy',
                fillcolor: `${cfg.color}18`,
                name: cfg.labelY,
                hovertemplate: `${cfg.labelX}: %{x:.3f}<br>${cfg.labelY}: %{y:.3f}<extra></extra>`
            },
            {
                x: [valorCentral], y: [yCtr],
                mode: 'markers', name: 'Punto de diseño',
                marker: {
                    color: '#f8fafc', size: 12, symbol: 'diamond',
                    line: { color: cfg.color, width: 2.5 }
                },
                hovertemplate: `Diseño actual<br>${cfg.labelX}: %{x:.3f}<extra></extra>`
            }
        ];

        const layout = {
            ...PLOTLY_THEME,
            margin: { l: 52, r: 20, t: 20, b: 48 },
            xaxis: {
                ...PLOTLY_THEME.xaxis,
                title: { text: cfg.labelX, font: { color: '#64748b', size: 10 } }
            },
            yaxis: {
                ...PLOTLY_THEME.yaxis,
                title: { text: cfg.labelY, font: { color: '#64748b', size: 10 } }
            },
            shapes: [{
                type: 'line', x0: valorCentral, x1: valorCentral,
                y0: 0, y1: 1, yref: 'paper',
                line: { color: cfg.color, width: 1.5, dash: 'dot' }
            }],
            annotations: []
        };

        Plotly.react(chartId, traces, layout, PLOTLY_CONFIG);
    }
}

function _anotarFormula(chartId, formula, r2, color) {
    Plotly.relayout(chartId, {
        annotations: [{
            text:    `<b>${formula}</b><br>R² = ${r2}`,
            xref:    'paper', yref: 'paper',
            x: 0.99, y: 0.04,
            xanchor: 'right', yanchor: 'bottom',
            showarrow: false,
            font:    { color, size: 9, family: 'monospace' },
            bgcolor: 'rgba(15,23,42,0.75)',
            bordercolor: color,
            borderwidth: 1,
            borderpad: 4,
        }]
    });
}

// SIMULACIÓN MANUAL ───────────────────────────────────────────────
function resetearManual() {
    CAMPOS_CONFIG.forEach(c => {
        const inp = document.getElementById(`manual-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (inp) inp.value = c.default;
    });
    actualizarStatusBar('Parámetros restablecidos a valores por defecto');
}

async function calcularManual() {
    if (!verificarModeloCargado()) return;
    try {
        const valores = {};
        CAMPOS_CONFIG.forEach(c => {
            const inp = document.getElementById(`manual-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`);
            valores[c.nombre] = parseFloat(inp.value);
        });

        mostrarCargando(true);
        const res  = await fetch(`${API_URL}/simular`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valores })
        });
        const data = await res.json();
        if (data.success) {
            const r = aplicarFactores(data.resultados);
            document.getElementById('resManualQitd').textContent  = r.Qitd.toFixed(4);
            document.getElementById('resManualDpair').textContent = r.DpAir.toFixed(4);
            document.getElementById('resManualDpw').textContent   = r.DpW.toFixed(4);
            guardarEnHistorial('Manual', valores, r);
            actualizarStatusBar('Predicción ejecutada · Generando curvas de sensibilidad...');
            calcularYGraficarSensibilidad(valores, 'Manual');
        } else throw new Error(data.error);
    } catch (e) {
        mostrarNotificacion(`Error: ${e.message}`, 'error');
    } finally {
        mostrarCargando(false);
    }
}

// MODELOS PRECARGADOS ─────────────────────────────────────────────

async function autoLlenarPreset() {
    const nombre = document.getElementById('comboModelos').value;
    if (!nombre) return;
    try {
        const res  = await fetch(`${API_URL}/modelo/${encodeURIComponent(nombre)}`);
        const data = await res.json();
        if (data.success) {
            appState.modeloSeleccionado  = data.modelo;
            appState.dimensionesActuales = data.modelo;
            CAMPOS_DIMENSIONALES.forEach(c => {
                const el = document.getElementById(`preset-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
                if (el && data.modelo[c] !== undefined) el.textContent = data.modelo[c];
            });
            actualizarStatusBar(`Modelo cargado: ${nombre}`);
        }
    } catch (e) { console.error(e); }
}

async function calcularPreset() {
    if (!verificarModeloCargado()) return;
    try {
        const valores = {};
        CAMPOS_OPERACIONALES.forEach(c => {
            const inp = document.getElementById(`preset-op-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`);
            valores[c.nombre] = parseFloat(inp.value);
        });
        CAMPOS_DIMENSIONALES.forEach(c => {
            const el = document.getElementById(`preset-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
            if (el && el.textContent !== '---') valores[c] = parseFloat(el.textContent);
        });

        mostrarCargando(true);
        const res  = await fetch(`${API_URL}/simular`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valores })
        });
        const data = await res.json();
        if (data.success) {
            const r = aplicarFactores(data.resultados);
            document.getElementById('resPresetQitd').textContent  = r.Qitd.toFixed(4);
            document.getElementById('resPresetDpair').textContent = r.DpAir.toFixed(4);
            document.getElementById('resPresetDpw').textContent   = r.DpW.toFixed(4);
            const nombre = document.getElementById('comboModelos').value;
            guardarEnHistorial(`Preset: ${nombre}`, valores, r);
            actualizarStatusBar(`Simulación completada: ${nombre} · Generando curvas...`);
            calcularYGraficarSensibilidad(valores, 'Preset');
        } else throw new Error(data.error);
    } catch (e) {
        mostrarNotificacion(`Error: ${e.message}`, 'error');
    } finally {
        mostrarCargando(false);
    }
}

// ANÁLISIS DE RANGOS ──────────────────────────────────────────────

function actualizarDimensionesRangos() {
    if (!appState.dimensionesActuales || !Object.keys(appState.dimensionesActuales).length) {
        mostrarNotificacion('Primero selecciona un modelo en "Modelos Precargados"', 'warning');
        return;
    }
    CAMPOS_DIMENSIONALES.forEach(c => {
        const el = document.getElementById(`rangos-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (el && appState.dimensionesActuales[c] !== undefined)
            el.textContent = appState.dimensionesActuales[c];
    });
    const nombre = document.getElementById('comboModelos').value;
    mostrarNotificacion(`Dimensiones sincronizadas: ${nombre}`, 'success');
}

function actualizarPreviewRango(variable) {
    try {
        const vid   = variable.replace(/[^a-zA-Z0-9]/g, '');
        const min   = parseFloat(document.getElementById(`rango-${vid}-min`).value);
        const max   = parseFloat(document.getElementById(`rango-${vid}-max`).value);
        const steps = parseInt(document.getElementById(`rango-${vid}-steps`).value);
        if (!isNaN(min) && !isNaN(max) && !isNaN(steps) && steps > 1) {
            const vals = linspace(min, max, steps);
            document.getElementById(`rango-${vid}-preview`).textContent =
                `[${vals[0].toFixed(2)} … ${vals[vals.length-1].toFixed(2)}]`;
        } else {
            document.getElementById(`rango-${vid}-preview`).textContent = '---';
        }
        calcularTotalCombinaciones();
    } catch (_) {}
}

function calcularTotalCombinaciones() {
    let total = 1;
    VARIABLES_RANGOS.forEach(v => {
        const s = parseInt(document.getElementById(`rango-${v.replace(/[^a-zA-Z0-9]/g,'')}-steps`)?.value);
        if (!isNaN(s) && s > 0) total *= s;
    });
    document.getElementById('totalCombinaciones').textContent = `Cálculos previstos: ${total.toLocaleString()}`;
}

function previewCombinaciones() {
    try {
        const rangos = {};
        VARIABLES_RANGOS.forEach(v => {
            const vid = v.replace(/[^a-zA-Z0-9]/g,'');
            rangos[v] = linspace(
                parseFloat(document.getElementById(`rango-${vid}-min`).value),
                parseFloat(document.getElementById(`rango-${vid}-max`).value),
                parseInt(document.getElementById(`rango-${vid}-steps`).value)
            );
        });
        const combos = cartesianProduct(Object.values(rangos)).slice(0, 10);
        let txt = 'Primeras 10 combinaciones:\n\n';
        combos.forEach((c, i) => {
            txt += `${i+1}. `;
            c.forEach((val, j) => { txt += `${VARIABLES_RANGOS[j]}=${val.toFixed(2)}  `; });
            txt += '\n';
        });
        alert(txt);
    } catch (_) { mostrarNotificacion('Configura correctamente todos los rangos', 'warning'); }
}

async function generarMatriz() {
    if (!verificarModeloCargado()) return;
    try {
        const rangos = {};
        VARIABLES_RANGOS.forEach(v => {
            const vid   = v.replace(/[^a-zA-Z0-9]/g, '');
            const min   = parseFloat(document.getElementById(`rango-${vid}-min`).value);
            const max   = parseFloat(document.getElementById(`rango-${vid}-max`).value);
            const steps = parseInt(document.getElementById(`rango-${vid}-steps`).value);
            if (isNaN(min) || isNaN(max) || isNaN(steps)) throw new Error(`Configura correctamente ${v}`);
            rangos[v] = { min, max, steps };
        });

        const dimFijas = {};
        CAMPOS_DIMENSIONALES.forEach(c => {
            const el = document.getElementById(`rangos-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
            if (el && el.textContent !== '---') dimFijas[c] = parseFloat(el.textContent);
        });
        if (!Object.keys(dimFijas).length) throw new Error('Sincroniza las dimensiones primero');

        mostrarCargando(true);

        // ── Calcular valor fijo para las variables que NO se barren ──
        const valorFijo = {};
        VARIABLES_RANGOS.forEach(v => {
            valorFijo[v] = (rangos[v].min + rangos[v].max) / 2;
        });

        // ── Barrer cada gráfica con su propia varX ───────────────────
        for (const cfg of RANGOS_SWEEP) {
            const r      = rangos[cfg.varX];
            const xVals  = linspace(r.min, r.max, r.steps > 1 ? r.steps : 10);
            const ys     = [];

            for (const xv of xVals) {
                // Fijar todas las variables operacionales, luego sobreescribir la que se barre
                const vars = { ...dimFijas, ...valorFijo, [cfg.varX]: xv };
                const res  = await fetch(`${API_URL}/simular`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ valores: vars })
                });
                const data = await res.json();
                if (data.success) {
                    const resultado = aplicarFactores(data.resultados);
                    ys.push(resultado[cfg.key]);
                }
            }

            _renderRangoChart(cfg.chartId, xVals, ys, cfg.labelX, cfg.yLabel, cfg.color);
        }

        actualizarStatusBar(`Análisis completado — ejes independientes por variable`);

        const rangosParaExcel = {};
        VARIABLES_RANGOS.forEach(v => {
            const vid = v.replace(/[^a-zA-Z0-9]/g, '');
            rangosParaExcel[v] = {
                min:   parseFloat(document.getElementById(`rango-${vid}-min`).value),
                max:   parseFloat(document.getElementById(`rango-${vid}-max`).value),
                steps: parseInt(document.getElementById(`rango-${vid}-steps`).value)
            };
        });
        await _generarExcelMatriz(rangosParaExcel, dimFijas);

    } catch (e) {
        mostrarNotificacion(`Error: ${e.message}`, 'error');
    } finally {
        mostrarCargando(false);
    }
    
}

function _renderRangoChart(divId, xs, ys, labelBarrido, yLabel, color) {
    const trace = {
        x: xs, y: ys, mode: 'lines+markers',
        line:      { color, width: 2.5, shape: 'spline' },
        marker:    { color, size: 6, line: { color: '#0f172a', width: 1.5 } },
        fill:      'tozeroy',
        fillcolor: `${color}18`,
        name: yLabel,
        hovertemplate: `${labelBarrido}: %{x:.3f}<br>${yLabel}: %{y:.3f}<extra></extra>`
    };

    const layout = {
        ...PLOTLY_THEME,
        title: { text: yLabel, font: { color, size: 14, weight: 'bold' }, x: 0.04 },
        xaxis: {
            ...PLOTLY_THEME.xaxis,
            title: { text: labelBarrido, font: { color: '#64748b', size: 10 } }
        },
        yaxis: {
            ...PLOTLY_THEME.yaxis,
            title: { text: yLabel, font: { color: '#64748b', size: 10 } }
        },
        annotations: []
    };

    Plotly.react(divId, [trace], layout, PLOTLY_CONFIG);
}

async function _generarExcelMatriz(rangos, dimFijas) {
    try {
        const res = await fetch(`${API_URL}/generar-matriz`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rangos, dimensiones: dimFijas })
        });
        const data = await res.json();
        if (data.success) {
            descargarArchivo(data.archivo, data.filename);
            mostrarNotificacion('Matriz generada correctamente', 'success');
        }
    } catch (e) { 
        mostrarNotificacion(`Error: ${e.message}`, 'error'); 
    }
}

// HISTORIAL ───────────────────────────────────────────────────────

function guardarEnHistorial(tipo, valores, resultados) {
    const entrada = {
        timestamp: new Date().toLocaleString('es-MX'),
        tipo, valores, resultados
    };
    appState.historialSimulaciones.push(entrada);
    appState.ultimaPrediccion = entrada;
    actualizarVistaHistorial();
}

function actualizarVistaHistorial() {
    const container = document.getElementById('historialContent');
    if (!appState.historialSimulaciones.length) {
        container.innerHTML = `<div class="empty-state"><i data-lucide="inbox"></i><p>No hay simulaciones registradas</p></div>`;
        lucide.createIcons(); return;
    }
    container.innerHTML = '';
    appState.historialSimulaciones.slice(-20).reverse().forEach((e, idx) => {
        const div = document.createElement('div');
        div.className = 'history-entry';
        div.innerHTML = `
            <div class="history-header">
                <span class="history-timestamp">#${Math.min(20, appState.historialSimulaciones.length) - idx} | ${e.timestamp}</span>
                <span class="history-tipo">${e.tipo}</span>
            </div>
            <div class="history-results">
                <div class="history-result-item">
                    <span class="history-result-label">Qitd:</span>
                    <span class="history-result-value" style="color:${COLOR_QITD}">${e.resultados.Qitd.toFixed(4)} W</span>
                </div>
                <div class="history-result-item">
                    <span class="history-result-label">DpAir:</span>
                    <span class="history-result-value" style="color:${COLOR_DPAIR}">${e.resultados.DpAir.toFixed(2)} Pa</span>
                </div>
                <div class="history-result-item">
                    <span class="history-result-label">DpW :</span>
                    <span class="history-result-value" style="color:${COLOR_DPW}">${e.resultados.DpW.toFixed(2)} mbar</span>
                </div>
            </div>`;
        container.appendChild(div);
    });
}

async function exportarHistorial() {
    if (!appState.historialSimulaciones.length) {
        mostrarNotificacion('No hay simulaciones en el historial', 'warning'); 
        return;
    }
    try {
        const res = await fetch(`${API_URL}/exportar-historial`, {
            method: 'POST',
            credentials: 'include', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ historial: appState.historialSimulaciones })
        });
        const data = await res.json();
        if (data.success) {
            descargarArchivo(data.archivo, data.filename);
            mostrarNotificacion(`Historial exportado: ${appState.historialSimulaciones.length} registros`, 'success');
        }
    } catch (e) { 
        mostrarNotificacion(`Error: ${e.message}`, 'error'); 
    }
}

function limpiarHistorial() {
    if (!confirm('¿Limpiar todo el historial?')) return;
    appState.historialSimulaciones = [];
    actualizarVistaHistorial();
    actualizarStatusBar('Historial limpiado');
}

async function exportarUltima() {
    try {
        const res = await fetch(`${API_URL}/exportar-ultima`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prediccion: appState.ultimaPrediccion })
        });
        const data = await res.json();
        if (data.success) {
            descargarArchivo(data.archivo, data.filename);
            mostrarNotificacion('Última predicción exportada', 'success');
        }
    } catch (e) { 
        mostrarNotificacion(`Error: ${e.message}`, 'error'); 
    }
}
// UTILIDADES ──────────────────────────────────────────────────────

function verificarModeloCargado() {
    if (!appState.modeloIA) { mostrarNotificacion('Carga primero el modelo .pkl', 'warning'); return false; }
    return true;
}

function actualizarStatusBar(msg) {
    document.getElementById('statusBarText').textContent = msg;
}

function mostrarCargando(v) {
    document.body.style.cursor = v ? 'wait' : 'default';
    document.querySelectorAll('.btn-execute').forEach(btn => {
        btn.style.opacity       = v ? '0.6' : '1';
        btn.style.pointerEvents = v ? 'none' : 'auto';
    });
}

function descargarArchivo(b64, filename) {
    const a = document.createElement('a');
    a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function linspace(start, end, num) {
    if (num < 2) return [start];
    const step = (end - start) / (num - 1);
    return Array.from({ length: num }, (_, i) => start + step * i);
}

function cartesianProduct(arrays) {
    return arrays.reduce((acc, arr) =>
        acc.flatMap(x => arr.map(y => [...(Array.isArray(x) ? x : [x]), y])), [[]]);
}

// ── Gráficas de rangos — inicialización vacía ────────────────────
function inicializarGraficasRangos() {
    [
        ['chartRangosQitd',  'Q<sub>ITD</sub> (W)',         COLOR_QITD],
        ['chartRangosDpair', 'ΔP<sub>Air</sub> (Pa) ×1.15', COLOR_DPAIR],
        ['chartRangosDpw',   'ΔP<sub>W</sub> (mbar) ×1.20', COLOR_DPW],
    ].forEach(([id, lbl, color]) => {
        Plotly.newPlot(id, [], {
            ...PLOTLY_THEME,
            title: { text: lbl, font: { color, size: 14 }, x: 0.04 },
            xaxis: {
                ...PLOTLY_THEME.xaxis,
                title: { text: 'Variable de barrido', font: { color: '#64748b', size: 10 } }
            },
            yaxis: {
                ...PLOTLY_THEME.yaxis,
                title: { text: lbl, font: { color: '#64748b', size: 10 } }
            },
            annotations: [{
                text: 'Esperando parámetros...',
                xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
                showarrow: false, font: { color: '#334155', size: 14 }
            }]
        }, PLOTLY_CONFIG);
    });
}

// ── Interceptor global de respuestas 401 / 403 ──────────────────
// Envuelve fetch nativo para redirigir al login en sesiones expiradas.
const _fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args) => {
    const res = await _fetchOriginal(...args);
    const url = typeof args[0] === 'string' ? args[0] : '';
    if (res.status === 401 && !url.includes('/api/auth/')) {
        window.location.href = '/login';
    }
    if (res.status === 403) {
        mostrarNotificacion('Acceso denegado: se requiere rol Administrador', 'error');
    }
    return res;
};

// ─ Verificar sesión al cargar y manejar errores 401/403 ──
async function verificarSesion() {
    // ── Limpiar clases de sesión anterior ────────────────
    document.body.classList.remove('is-admin');
    
    try {
        const res = await _fetchOriginal('/api/auth/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/login'; return null; }

        const data = await res.json();
        if (!data.autenticado) { window.location.href = '/login'; return null; }

        const { nombre, rol } = data.usuario;

        document.getElementById('statusUsuario').textContent = nombre;
        const elRol = document.getElementById('statusRol');
        elRol.textContent = rol === 'admin' ? 'ADMINISTRADOR' : 'VIEWER';

        if (rol === 'admin') {
            document.body.classList.add('is-admin');
            elRol.style.color = '#ef4444';
        } else {
            elRol.style.color = '#10b981';
        }

        return data.usuario;

    } catch (e) {
        console.error('Error verificando sesión:', e);
        window.location.href = '/login';
        return null;
    }
}

async function cerrarSesion() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
}

async function inicializarApp() {
    const usuario = await verificarSesion();
    if (!usuario) return;

    generarCamposManual();
    generarCamposPresets();
    generarCamposRangos();
    await cargarModelosDisponibles();
    inicializarGraficasSensibilidad();
    inicializarGraficasRangos();
    lucide.createIcons();
    actualizarStatusBar(`Sesión activa: ${usuario.nombre} (${usuario.rol})`);
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarApp();
});