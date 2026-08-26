// app.js - Lógica principal del frontend de AirSystem (VERSIÓN PORTAFOLIO STATIC)

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

// PALETA DE COLORES
const COLOR_QITD  = '#f97316';
const COLOR_DPAIR = '#10b981';
const COLOR_DPW   = '#3b82f6';

const FACTOR_DPAIR = 1.0;
const FACTOR_DPW   = 1.0; 

function aplicarFactores(resultados) {
    return {
        Qitd:  resultados.Qitd,
        DpAir: resultados.DpAir * FACTOR_DPAIR,
        DpW:   resultados.DpW   * FACTOR_DPW,
    };
}

const PLOTLY_THEME = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { family: 'Inter, system-ui', color: '#94a3b8', size: 11 },
    xaxis: { gridcolor: '#1e293b', zerolinecolor: '#334155', linecolor: '#334155', tickfont: { color: '#94a3b8' } },
    yaxis: { gridcolor: '#1e293b', zerolinecolor: '#334155', linecolor: '#334155', tickfont: { color: '#94a3b8' } },
    margin: { l: 52, r: 20, t: 44, b: 48 },
    legend: { bgcolor: 'rgba(15,23,42,0.8)', bordercolor: '#334155', borderwidth: 1, font: { color: '#e2e8f0', size: 10 } },
    hoverlabel: { bgcolor: '#0f172a', bordercolor: '#3b82f6', font: { color: '#f8fafc', size: 12 } }
};

const PLOTLY_CONFIG = {
    responsive: true, displayModeBar: true,
    modeBarButtonsToRemove: ['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    displaylogo: false
};

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

// GESTIÓN DE TABS
function mostrarTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.closest('.tab-btn').classList.add('active');
    lucide.createIcons();

    if (tabName === 'rangos') {
        Plotly.Plots.resize('chartRangosQitd'); Plotly.Plots.resize('chartRangosDpair'); Plotly.Plots.resize('chartRangosDpw');
    }
    if (tabName === 'manual') SENS_CHARTS.forEach((_, idx) => Plotly.Plots.resize(_idSensChart('Manual', idx)));
    if (tabName === 'presets') SENS_CHARTS.forEach((_, idx) => Plotly.Plots.resize(_idSensChart('Preset', idx)));
}

// NOTIFICACIONES
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

// CARGA DE ARCHIVOS (MOCK)
function cargarModeloIA()    { document.getElementById('fileInputIA').click(); }
function cargarExcelExterno(){ document.getElementById('fileInputExcel').click(); }

async function procesarArchivoIA(event) {
    const file = event.target.files[0];
    if (!file) return;
    mostrarCargando(true);
    setTimeout(() => {
        appState.modeloIA = true;
        document.getElementById('statusIA').textContent  = 'Conectado';
        document.getElementById('dotIA').className       = 'dot success';
        mostrarNotificacion(`Modelo cargado visualmente: ${file.name}`, 'success');
        actualizarStatusBar(`IA activa: ${file.name}`);
        mostrarCargando(false);
    }, 800);
}

async function procesarArchivoExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    mostrarCargando(true);
    setTimeout(() => {
        mostrarNotificacion(`Base de datos externa simulada cargada`, 'success');
        mostrarCargando(false);
    }, 800);
}

// MODELOS DISPONIBLES (MOCK)
async function cargarModelosDisponibles() {
    // MOCK PARA PORTAFOLIO: Evita llamar al backend y carga datos falsos
    appState.modelosDisponibles = ["AirSystem_Radiador_Alpha", "AirSystem_Condensador_V2", "Modelo_Custom_01"];
    actualizarComboModelos();
    document.getElementById('statusModelos').textContent = appState.modelosDisponibles.length;
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

// GENERACIÓN DE CAMPOS DINÁMICOS
function generarCamposManual() {
    const form = document.getElementById('formManual');
    CAMPOS_CONFIG.forEach(c => {
        const div = document.createElement('div'); div.className = 'field-group';
        const lbl = document.createElement('label'); lbl.textContent = `${c.label ?? c.nombre} (${c.unidad})`;
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any';
        inp.id = `manual-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`; inp.value = c.default;
        div.appendChild(lbl); div.appendChild(inp); form.appendChild(div);
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
        const lbl = document.createElement('label'); lbl.textContent = `${c.label ?? c.nombre} (${c.unidad})`;
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any';
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

// GRÁFICAS DE SENSIBILIDAD
const SENS_CHARTS = [
    { varX: 'Va (m/s)', labelX: 'Velocidad de Aire (m/s)', varY: 'Qitd', labelY: 'Qitd (W)', color: COLOR_QITD, delta: 0.30, minDelta: 0.3 },
    { varX: 'Va (m/s)', labelX: 'Velocidad de Aire (m/s)', varY: 'DpAir', labelY: 'ΔP Aire (Pa)', color: COLOR_DPAIR, delta: 0.30, minDelta: 0.5 },
    { varX: 'Qw (L/m)', labelX: 'Flujo de Agua (L/min)', varY: 'DpW', labelY: 'ΔP Agua (mbar)', color: COLOR_DPW, delta: 0.50, minDelta: 5.0 },
];

function _idSensChart(tabPrefix, idx) { return `${tabPrefix}Sens${idx}`; }

function inicializarGraficasSensibilidad() {
    ['Manual', 'Preset'].forEach(tab => {
        const tabL    = tab.toLowerCase();
        const tabId   = tabL === 'preset' ? 'tab-presets' : `tab-${tabL}`;
        const section = document.querySelector(`#${tabId} .chart-section`);
        if (!section) return;

        const h3 = section.querySelector('h3');
        if (h3) h3.textContent = 'Curvas de Sensibilidad Local';

        section.querySelectorAll('.sens-chart-wrapper').forEach(el => el.remove());
        const old = section.querySelector('.plotly-chart');
        if (old) old.remove();

        SENS_CHARTS.forEach((cfg, idx) => {
            const wrapper = document.createElement('div'); wrapper.className = 'sens-chart-wrapper';
            const label = document.createElement('p'); label.className = 'sens-curve-label'; label.style.color = cfg.color; label.textContent = `${cfg.labelX}  →  ${cfg.labelY}`;
            const div = document.createElement('div'); div.id = _idSensChart(tab, idx); div.className = 'plotly-chart';
            wrapper.appendChild(label); wrapper.appendChild(div); section.appendChild(wrapper);

            Plotly.newPlot(div.id, [], {
                ...PLOTLY_THEME,
                margin: { l: 52, r: 20, t: 20, b: 48 },
                xaxis: { ...PLOTLY_THEME.xaxis, title: { text: cfg.labelX, font: { color: '#64748b', size: 10 } } },
                yaxis: { ...PLOTLY_THEME.yaxis, title: { text: cfg.labelY, font: { color: '#64748b', size: 10 } } },
                annotations: [{ text: 'Función de backend desactivada para portafolio', xref: 'paper', yref: 'paper', x: 0.5, y: 0.5, showarrow: false, font: { color: '#334155', size: 13 } }]
            }, PLOTLY_CONFIG);
        });
    });
}

// SIMULACIÓN MANUAL
function resetearManual() {
    CAMPOS_CONFIG.forEach(c => {
        const inp = document.getElementById(`manual-${c.nombre.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (inp) inp.value = c.default;
    });
    actualizarStatusBar('Parámetros restablecidos a valores por defecto');
}

async function calcularManual() {
    mostrarNotificacion('La simulación requiere conexión al IA Core backend, actualmente en modo solo vista.', 'info');
}

// MODELOS PRECARGADOS (MOCK)
async function autoLlenarPreset() {
    const nombre = document.getElementById('comboModelos').value;
    if (!nombre) return;
    
    // MOCK PARA PORTAFOLIO: Rellena los datos de la interfaz visualmente
    const modeloFalso = {
        "Height (mm)": 452, "Large (mm)": 650, "Thickness (mm)": 27,
        "Ntubes": 74, "Theight (mm)": 1.3, "Fin Height (mm)": 4.7,
        "Fin Pitch (mm)": 0.94, "Tube Thick (mm)": 0.24, "Dimple": 1
    };
    
    appState.modeloSeleccionado  = modeloFalso;
    appState.dimensionesActuales = modeloFalso;
    
    CAMPOS_DIMENSIONALES.forEach(c => {
        const el = document.getElementById(`preset-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (el && modeloFalso[c] !== undefined) el.textContent = modeloFalso[c];
    });
    actualizarStatusBar(`Modelo cargado (Demo): ${nombre}`);
}

async function calcularPreset() {
    mostrarNotificacion('La simulación requiere conexión al IA Core backend, actualmente en modo solo vista.', 'info');
}

// ANÁLISIS DE RANGOS
function actualizarDimensionesRangos() {
    if (!appState.dimensionesActuales || !Object.keys(appState.dimensionesActuales).length) {
        mostrarNotificacion('Primero selecciona un modelo en "Modelos Precargados"', 'warning'); return;
    }
    CAMPOS_DIMENSIONALES.forEach(c => {
        const el = document.getElementById(`rangos-dim-${c.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (el && appState.dimensionesActuales[c] !== undefined) el.textContent = appState.dimensionesActuales[c];
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
            document.getElementById(`rango-${vid}-preview`).textContent = `[${vals[0].toFixed(2)} … ${vals[vals.length-1].toFixed(2)}]`;
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
    mostrarNotificacion('Vista previa calculada correctamente', 'info');
}

async function generarMatriz() {
    mostrarNotificacion('El análisis matricial requiere conexión al backend.', 'info');
}

function linspace(start, end, num) {
    if (num < 2) return [start];
    const step = (end - start) / (num - 1);
    return Array.from({ length: num }, (_, i) => start + step * i);
}

// HISTORIAL
function limpiarHistorial() {
    if (!confirm('¿Limpiar todo el historial?')) return;
    appState.historialSimulaciones = [];
    actualizarVistaHistorial();
    actualizarStatusBar('Historial limpiado');
}

function actualizarVistaHistorial() {
    const container = document.getElementById('historialContent');
    container.innerHTML = `<div class="empty-state"><i data-lucide="inbox"></i><p>No hay simulaciones registradas en esta demo</p></div>`;
    lucide.createIcons(); return;
}

async function exportarHistorial() { mostrarNotificacion('No hay datos para exportar en el entorno de visualización', 'warning'); }
async function exportarUltima() { mostrarNotificacion('No hay datos para exportar en el entorno de visualización', 'warning'); }

// UTILIDADES
function verificarModeloCargado() {
    if (!appState.modeloIA) { mostrarNotificacion('Carga primero un modelo .pkl', 'warning'); return false; }
    return true;
}

function actualizarStatusBar(msg) { document.getElementById('statusBarText').textContent = msg; }

function mostrarCargando(v) {
    document.body.style.cursor = v ? 'wait' : 'default';
    document.querySelectorAll('.btn-execute').forEach(btn => {
        btn.style.opacity       = v ? '0.6' : '1';
        btn.style.pointerEvents = v ? 'none' : 'auto';
    });
}

function inicializarGraficasRangos() {
    [
        ['chartRangosQitd',  'Q<sub>ITD</sub> (W)',         COLOR_QITD],
        ['chartRangosDpair', 'ΔP<sub>Air</sub> (Pa) ×1.15', COLOR_DPAIR],
        ['chartRangosDpw',   'ΔP<sub>W</sub> (mbar) ×1.20', COLOR_DPW],
    ].forEach(([id, lbl, color]) => {
        Plotly.newPlot(id, [], {
            ...PLOTLY_THEME,
            title: { text: lbl, font: { color, size: 14 }, x: 0.04 },
            xaxis: { ...PLOTLY_THEME.xaxis, title: { text: 'Variable de barrido', font: { color: '#64748b', size: 10 } } },
            yaxis: { ...PLOTLY_THEME.yaxis, title: { text: lbl, font: { color: '#64748b', size: 10 } } },
            annotations: [{ text: 'Visualización Estática', xref: 'paper', yref: 'paper', x: 0.5, y: 0.5, showarrow: false, font: { color: '#334155', size: 14 } }]
        }, PLOTLY_CONFIG);
    });
}

// MOCK DE SESIÓN
async function verificarSesion() {
    document.body.classList.remove('is-admin');
    
    // MOCK PARA PORTAFOLIO: Simula que ya entraste con permisos de administrador
    const usuario = { nombre: "Rafael Durán", rol: "admin" }; 

    document.getElementById('statusUsuario').textContent = usuario.nombre;
    const elRol = document.getElementById('statusRol');
    elRol.textContent = 'ADMINISTRADOR';
    document.body.classList.add('is-admin');
    elRol.style.color = '#ef4444';

    return usuario;
}

async function cerrarSesion() {
    mostrarNotificacion('Modo de visualización: No hay sesión real que cerrar', 'info');
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
    actualizarStatusBar(`Modo Portafolio Activo: ${usuario.nombre} (${usuario.rol})`);
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarApp();
});
