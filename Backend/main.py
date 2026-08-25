# app.py — Servidor Flask con rutas para autenticación, carga de modelos, simulaciones y generación de matrices.

import joblib
import pandas as pd
import numpy as np
import itertools
import os
import io
import base64
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename

from dataclasses import dataclass
from radiator_models import CombinedRadiatorModel
from auth import login_usuario, usuario_activo, login_requerido, solo_admin

from flask import Flask, request, jsonify, session, render_template, redirect

@dataclass
class ThetaQ:
    alpha_o:   float = 1.0;   alpha_i:   float = 1.0;   phi_f:     float = 1.0
    Rf_o:      float = 0.0;   Rf_i:      float = 0.0
    c_Ao_fin:  float = 1.0;   c_Ao_tube: float = 1.0
    Dh_o_s:    float = 1.0;   Dh_i_s:    float = 1.0;   L_fin_s:   float = 0.5
    j_C:       float = 0.005; Nu_exp:    float = 0.90
    t_fin:     float = 0.00070; t_wall:  float = 0.00027

@dataclass
class PhiAir:
    f_C:   float = 0.06;  f_exp: float = -0.25; Crow:  float = 1.00
    Kin:   float = 0.7;   Kout:  float = 0.7
    Dho_s: float = 1.0;   Lcorr: float = 1.0

@dataclass
class PhiWater:
    alpha_h:    float = 1.00; alpha_d:    float = 1.00; Dh_s:       float = 1.00
    Npass:      float = 1.00; eps:        float = 1e-6
    d_conn:     float = 0.027; a_hdr:     float = 0.050; Lhdr_s:    float = 1.00
    K_conn_in:  float = 0.30; K_conn_out: float = 0.30
    K_tube_in:  float = 0.30; K_tube_out: float = 0.30

class HybridModel(CombinedRadiatorModel):
    def __init__(self, dp_air, dp_w, mlp_q, transformer, feats_air, feats_w):
        super().__init__(
            dp_air_model=dp_air,
            dp_w_model=dp_w,
            dp_air_features=feats_air,
            dp_w_features=feats_w,
            mlp_q=mlp_q,
            transformer=transformer
        )

app = Flask(__name__)
app.secret_key = "airsystem-dev-secret-fijo-2024"
app.permanent_session_lifetime = timedelta(hours=8)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE']   = False

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

COLUMNAS_ENTRADA = [
    "ITD", "Va(m/s)", "Qw(L/m)",
    "Height(mm)", "Large(mm)", "Thickness(mm)",
    "Ntubes", "Theight(mm)", "FinHeight(mm)",
    "FinPitch(mm)", "TubeThick(mm)", "Dimple",
]

MODELOS_AIRSYSTEM = {
    "LTR H":                  {"Height (mm)": 205.0,  "Large (mm)":1240.0,  "Thickness (mm)": 17.0,   "Ntubes": 27,  "Theight (mm)": 1.4,  "Fin Height (mm)": 6.1,  "Fin Pitch (mm)": 1.41,  "Tube Thick (mm)": 0.2,  "Dimple": 1},
    "ATLAS V.2 (con dimple)": {"Height (mm)": 535.77, "Large (mm)": 746.42, "Thickness (mm)": 27.0,   "Ntubes": 123, "Theight (mm)": 1.3,  "Fin Height (mm)": 4.73, "Fin Pitch (mm)": 1.016, "Tube Thick (mm)": 0.2,  "Dimple": 1},
    "ATLAS V.1 (con dimple)": {"Height (mm)": 508,    "Large (mm)": 720,    "Thickness (mm)": 27,     "Ntubes": 84,  "Theight (mm)": 1.3,  "Fin Height (mm)": 4.7,  "Fin Pitch (mm)": 2.03,  "Tube Thick (mm)": 0.2,  "Dimple": 1},
    "ATLAS V.1 (Sin dimple)": {"Height (mm)": 508,    "Large (mm)": 720,    "Thickness (mm)": 27,     "Ntubes": 84,  "Theight (mm)": 1.3,  "Fin Height (mm)": 4.7,  "Fin Pitch (mm)": 2.03,  "Tube Thick (mm)": 0.2,  "Dimple": 0},
    "Mirage":                 {"Height (mm)": 374,    "Large (mm)": 490,    "Thickness (mm)": 16.68,  "Ntubes": 76,  "Theight (mm)": 1.25, "Fin Height (mm)": 4.28, "Fin Pitch (mm)": 1.14,  "Tube Thick (mm)": 0.22, "Dimple": 0},
    "OTHER":                  {"Height (mm)": 270,    "Large (mm)": 565,    "Thickness (mm)": 36,     "Ntubes": 24,  "Theight (mm)": 1.9,  "Fin Height (mm)": 9,    "Fin Pitch (mm)": 1.158, "Tube Thick (mm)": 0.24, "Dimple": 0},
    "BVA":                    {"Height (mm)": 380,    "Large (mm)": 569,    "Thickness (mm)": 15.805, "Ntubes": 79,  "Theight (mm)": 1.39, "Fin Height (mm)": 5.3,  "Fin Pitch (mm)": 2.12,  "Tube Thick (mm)": 0.27, "Dimple": 0},
    "BVM":                    {"Height (mm)": 403.6,  "Large (mm)": 380.0,  "Thickness (mm)": 18,     "Ntubes": 60,  "Theight (mm)": 1.4,  "Fin Height (mm)": 5.25, "Fin Pitch (mm)": 1.9,   "Tube Thick (mm)": 0.27, "Dimple": 0},
    "TESLA (Con dimple)":     {"Height (mm)": 650.0,  "Large (mm)": 1470.0, "Thickness (mm)": 40,     "Ntubes": 81,  "Theight (mm)": 2.0,  "Fin Height (mm)": 6,    "Fin Pitch (mm)": 1.21,  "Tube Thick (mm)": 0.27, "Dimple": 1},
    "TESLA (Sin dimple)":     {"Height (mm)": 650.0,  "Large (mm)": 1470.0, "Thickness (mm)": 40,     "Ntubes": 81,  "Theight (mm)": 2.0,  "Fin Height (mm)": 6,    "Fin Pitch (mm)": 1.21,  "Tube Thick (mm)": 0.27, "Dimple": 0},
    "LTR R":                  {"Height (mm)": 214.9,  "Large (mm)": 1240.6, "Thickness (mm)": 27,     "Ntubes": 27,  "Theight (mm)": 1.74, "Fin Height (mm)": 6,    "Fin Pitch (mm)": 1.15,  "Tube Thick (mm)": 0.22, "Dimple": 1},
    "JCB":                    {"Height (mm)": 491.41, "Large (mm)": 645.0,  "Thickness (mm)": 105.3,  "Ntubes": 42,  "Theight (mm)": 1.8,  "Fin Height (mm)": 9.7,  "Fin Pitch (mm)": 2.8,   "Tube Thick (mm)": 0.37, "Dimple": 0},
    "T255":                   {"Height (mm)": 413.75, "Large (mm)": 610.4,  "Thickness (mm)": 25.45,  "Ntubes": 49,  "Theight (mm)": 1.71, "Fin Height (mm)": 6.4,  "Fin Pitch (mm)": 1.4,   "Tube Thick (mm)": 0.29, "Dimple": 0},
}

app_state = {'pipeline': None, 'modelos_externos': {}}
# ════════════════════════════════════════════════════════════════
#  RUTAS DE AUTENTICACIÓN
# ════════════════════════════════════════════════════════════════

@app.route('/login', methods=['GET'])
def login_page():
    if usuario_activo():
        return redirect('/')
    return render_template('login.html')

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data     = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = login_usuario(username, password)
    if not user:
        return jsonify({"success": False, "error": "Credenciales incorrectas"}), 401

    session.permanent = True
    session['usuario'] = user
    return jsonify({
        "success": True,
        "usuario": {"username": user['username'], "nombre": user['nombre'], "rol": user['rol']}
    })

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"success": True})

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    print(">>> SESSION en /me:", dict(session))
    user = usuario_activo()
    if not user:
        return jsonify({"success": False, "autenticado": False}), 401
    return jsonify({"success": True, "autenticado": True, "usuario": user})

# ════════════════════════════════════════════════════════════════
#  RUTA EXCLUSIVA ADMIN — actualizar modelo IA
# ════════════════════════════════════════════════════════════════
@app.route('/api/update-model', methods=['POST'])
@solo_admin
def update_model():
    if 'file' not in request.files or request.files['file'].filename == '':
        return jsonify({'success': False, 'error': 'No se envió ningún archivo'}), 400

    file = request.files['file']
    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        obj = joblib.load(filepath)

        if not isinstance(obj, CombinedRadiatorModel):
            raise ValueError("El archivo no es una instancia válida de CombinedRadiatorModel.")

        required_attrs = ('dp_air_model', 'dp_w_model', 'mlp_q', 'transformer')
        missing = [a for a in required_attrs if not hasattr(obj, a) or getattr(obj, a) is None]
        
        if missing:
            raise ValueError(f"Modelo V7 incompleto o incompatible. Faltan: {missing}")

        app_state['pipeline'] = obj
        return jsonify({'success': True, 'mensaje': f'Modelo actualizado: {filename}'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ════════════════════════════════════════════════════════════════
#  RUTAS EXISTENTES — protegidas con @login_requerido
# ════════════════════════════════════════════════════════════════
@app.route('/api/modelos', methods=['GET'])
@login_requerido  
def obtener_modelos():
    modelos = list(MODELOS_AIRSYSTEM.keys()) + list(app_state['modelos_externos'].keys())
    return jsonify({'success': True, 'modelos': modelos})

@app.route('/api/modelo/<nombre>', methods=['GET'])
@login_requerido
def obtener_modelo(nombre):
    src = MODELOS_AIRSYSTEM if nombre in MODELOS_AIRSYSTEM else app_state['modelos_externos']
    if nombre in src:
        return jsonify({'success': True, 'modelo': src[nombre]})
    return jsonify({'success': False, 'error': 'Modelo no encontrado'}), 404

@app.route('/api/cargar-modelo', methods=['POST'])
@solo_admin
def cargar_modelo_ia():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'Archivo no encontrado'}), 400

    file = request.files['file']
    try:
        filepath = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
        file.save(filepath)
        
        obj = joblib.load(filepath)

        if not isinstance(obj, CombinedRadiatorModel):
            raise ValueError("Instancia de modelo no válida.")

        app_state['pipeline'] = obj

        if hasattr(obj, 'mlp_q') and obj.mlp_q is not None:
            engine_info = "Motor: MLP Physics-Informed (V7)"
        elif hasattr(obj, 'qitd_A'):
            engine_info = f"Motor: Lineal (A={obj.qitd_A:.4f})"
        else:
            engine_info = "Motor: Físico Base"

        info = (f"{engine_info} | "
                f"Air Features: {len(obj.dp_air_features)} | "
                f"Water Features: {len(obj.dp_w_features)}")

        return jsonify({
            'success': True, 
            'modelo': file.filename, 
            'info': info
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cargar-excel', methods=['POST'])
@solo_admin
def cargar_excel_externo():
    if 'file' not in request.files or request.files['file'].filename == '':
        return jsonify({'success': False, 'error': 'No se envió ningún archivo'}), 400
    file = request.files['file']
    if not file.filename.endswith('.xlsx'):
        return jsonify({'success': False, 'error': 'Solo se permiten archivos .xlsx'}), 400
    try:
        filepath = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
        file.save(filepath)
        df = pd.read_excel(filepath)
        df.columns = df.columns.str.strip()
        campos_dim = ["Height (mm)", "Large (mm)", "Thickness (mm)", "Ntubes",
                        "Theight (mm)", "Fin Height (mm)", "Fin Pitch (mm)", "Tube Thick (mm)", "Dimple"]
        modelos_agregados = 0
        if 'Radiador Model' in df.columns:
            df['Radiador Model'] = df['Radiador Model'].ffill()
            for _, row in df.drop_duplicates(subset=['Radiador Model']).iterrows():
                modelo_data = {}
                for campo in campos_dim:
                    if campo in row:
                        v = row[campo]
                        modelo_data[campo] = int(v) if campo in ("Ntubes", "Dimple") else float(v)
                app_state['modelos_externos'][row['Radiador Model']] = modelo_data
                modelos_agregados += 1
        return jsonify({'success': True, 'modelos_agregados': modelos_agregados})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def predecir_con_modelo(valores_dict):
    pipeline = app_state['pipeline']
    if pipeline is None:
        raise Exception('No hay ningún modelo cargado.')

    datos_limpios = {k.replace(' ', ''): v for k, v in valores_dict.items()}
    
    try:
        input_data = []
        for col in COLUMNAS_ENTRADA:
            col_limpia = col.replace(' ', '')
            val = datos_limpios.get(col_limpia, 0)
            input_data.append(float(val))
            
        df_in = pd.DataFrame([input_data], columns=COLUMNAS_ENTRADA)
    except Exception as e:
        raise Exception(f"Error procesando datos de entrada: {str(e)}")

    v_val = float(datos_limpios.get('Va(m/s)', 0))
    qw_val = float(datos_limpios.get('Qw(L/m)', 0))
    itd_val = float(datos_limpios.get('ITD', 1.0))

    try:
        dp_air = pipeline.predict_dp_air(df_in)[0]
        dp_w = pipeline.predict_dp_w(df_in)[0]
        
        q_base = pipeline.predict_qitd(v_val, qw_val, full_features_df=df_in)
        
        if isinstance(q_base, (np.ndarray, list)):
            q_base = q_base[0]

        q_total = q_base * itd_val 

        return {
            'Qitd':  round(float(q_total), 2),
            'DpAir': round(float(dp_air), 2),
            'DpW':   round(float(dp_w), 2),
        }

    except AttributeError as e:
        if "attribute 'predict_qitd'" in str(e):
            raise Exception("El modelo cargado es demasiado antiguo. Usa uno V6 o V7.")
        raise Exception(f"Error de compatibilidad en el modelo: {str(e)}")

@app.route('/api/simular', methods=['POST'])
@login_requerido
def simular():
    if app_state['pipeline'] is None:
        return jsonify({'success': False, 'error': 'Debe cargar primero el modelo'}), 400
    try:
        valores = request.get_json().get('valores', {})
        return jsonify({'success': True, 'resultados': predecir_con_modelo(valores)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generar-matriz', methods=['POST'])
@login_requerido
def generar_matriz():
    if app_state['pipeline'] is None:
        return jsonify({'success': False, 'error': 'Debe cargar primero el modelo'}), 400
    try:
        data        = request.get_json()
        rangos      = data.get('rangos', {})
        dimensiones = data.get('dimensiones', {})
        listas, nombres = [], []
        for var, cfg in rangos.items():
            listas.append(np.linspace(cfg['min'], cfg['max'], cfg['steps']))
            nombres.append(var)
        resultados = []
        for combo in itertools.product(*listas):
            row = dimensiones.copy()
            for i, nombre in enumerate(nombres):
                row[nombre] = combo[i]
            pred = predecir_con_modelo(row)
            row.update({'Qitd_PREDICHO': pred['Qitd'], 'DpAir_PREDICHO': pred['DpAir'], 'DpW_PREDICHO': pred['DpW']})
            resultados.append(row)
        output = io.BytesIO()
        pd.DataFrame(resultados).to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return jsonify({'success': True,
                        'archivo': base64.b64encode(output.read()).decode('utf-8'),
                        'filename': f"matriz_simulaciones_{timestamp}.xlsx",
                        'total_simulaciones': len(resultados)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/exportar-historial', methods=['POST'])
@login_requerido
def exportar_historial():
    try:
        historial = request.get_json().get('historial', [])
        registros = []
        for e in historial:
            row = {'Timestamp': e['timestamp'], 'Tipo_Simulacion': e['tipo'],
                    'Qitd_Predicho': e['resultados']['Qitd'],
                    'DpAir_Predicho': e['resultados']['DpAir'],
                    'DpW_Predicho': e['resultados']['DpW']}
            row.update(e['valores'])
            registros.append(row)
        output = io.BytesIO()
        pd.DataFrame(registros).to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return jsonify({'success': True,
                        'archivo': base64.b64encode(output.read()).decode('utf-8'),
                        'filename': f"historial_simulaciones_{timestamp}.xlsx"})
    except Exception as e:
        import traceback
        print("ERROR exportar-historial:", traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/exportar-ultima', methods=['POST'])
@login_requerido
def exportar_ultima():
    try:
        prediccion = request.get_json().get('prediccion', {})
        row = prediccion['valores'].copy()
        row.update({'Qitd_Predicho': prediccion['resultados']['Qitd'],
                    'DpAir_Predicho': prediccion['resultados']['DpAir'],
                    'DpW_Predicho': prediccion['resultados']['DpW']})
        output = io.BytesIO()
        pd.DataFrame([row]).to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        return jsonify({'success': True,
                        'archivo': base64.b64encode(output.read()).decode('utf-8'),
                        'filename': 'ultima_prediccion.xlsx'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/')
@login_requerido
def index():
    return render_template('index.html')

if __name__ == '__main__':
    print(">>> SECRET_KEY:", app.secret_key)
    print(">>> COOKIE_NAME:", app.config.get('SESSION_COOKIE_NAME'))
    app.run(debug=True, host='0.0.0.0', port=5000)