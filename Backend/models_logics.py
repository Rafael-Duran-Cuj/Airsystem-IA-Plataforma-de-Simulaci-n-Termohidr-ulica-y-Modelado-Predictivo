import numpy as np
import pandas as pd
from dataclasses import dataclass
from sklearn.base import BaseEstimator, TransformerMixin, RegressorMixin

# ── Constantes físicas ───────────────────────────────────────────
RHO_A = 1.165; MU_A = 1.872e-5; CP_A = 1007.0; K_A = 0.0263
RHO_W = 997.0; MU_W = 6.50e-4; CP_W = 4180.0; K_W = 0.63
PR_A = CP_A * MU_A / K_A
PR_W = CP_W * MU_W / K_W
T_FIN = 0.00070

@dataclass
class ThetaQ:
    alpha_o: float = 1.0; alpha_i: float = 1.0; phi_f: float = 1.0
    Rf_o: float = 0.0; Rf_i: float = 0.0
    c_Ao_fin: float = 1.0; c_Ao_tube: float = 1.0
    Dh_o_s: float = 1.0; Dh_i_s: float = 1.0; L_fin_s: float = 0.5
    j_C: float = 0.005; Nu_exp: float = 0.90
    t_fin: float = 0.00070; t_wall: float = 0.00027

# ── Clases de Procesamiento Físico ──────────────────────────
class PhysicsFeatureAdderV7(BaseEstimator, TransformerMixin):
    INPUT_COLS = [
        'ITD', 'Va(m/s)', 'Qw(L/m)', 'Height(mm)', 'Large(mm)', 
        'Thickness(mm)', 'Ntubes', 'Theight(mm)', 'FinHeight(mm)', 
        'FinPitch(mm)', 'TubeThick(mm)', 'Dimple'
    ]

    def __init__(self, theta=None):
        self.theta = theta if theta else ThetaQ()

    def fit(self, X, y=None): return self

    def transform(self, X):
        if not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=self.INPUT_COLS)
        
        mm = 1e-3
        df_res = X.copy()
        FP = (X['FinPitch(mm)'] * mm).clip(lower=1e-5)
        Th = (X['Theight(mm)'] * mm).clip(lower=1e-6)
        Tk = (X['Thickness(mm)'] * mm).clip(lower=1e-6)
        
        sigma = ((FP - T_FIN) / FP).clip(0.1, 0.99)
        U_min = X['Va(m/s)'] / sigma
        
        # Bloque de 10 aero/hidro
        block1 = np.column_stack([
            sigma, U_min, (RHO_A * U_min * FP / MU_A), 
            0.5 * RHO_A * U_min**2, (Tk/FP),
            (2*Th*Tk/(Th+Tk)), (X['Qw(L/m)']/60000),
            np.zeros((len(X), 3)) 
        ])
        block2 = np.zeros((len(X), 6)) 
        return np.hstack([X.values, block1, block2])

# ── Clase de Regresión MLP ───────────────────────────────────────
class MultiTargetMLPWeighted(BaseEstimator, RegressorMixin):
    def __init__(self, mlp_configs, log_targets=(1, 2), drop_cols=None, col_names=None):
        self.mlp_configs = mlp_configs
        self.log_targets = log_targets
        self.drop_cols   = drop_cols or {}
        self.col_names   = col_names or []
        self.pipelines_  = []

    def fit(self, X, y, sample_weight=None):
        from sklearn.neural_network import MLPRegressor
        from sklearn.preprocessing import StandardScaler
        
        # Convertir a arrays de numpy para evitar problemas de índices
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=float)
        
        # Si y es 1D (un solo target), lo convertimos a 2D
        if y.ndim == 1:
            y = y.reshape(-1, 1)
            
        self.pipelines_ = []
        
        # Entrenamos un pipeline (Scaler + MLP) por cada salida (target)
        for i, cfg in enumerate(self.mlp_configs):
            yi = y[:, i].copy()
            
            # Aplicar log si el target está en la lista
            if i in self.log_targets:
                yi = np.log1p(yi)
            
            scaler = StandardScaler()
            Xi_sc = scaler.fit_transform(X)
            
            mlp = MLPRegressor(**cfg)
            
            # Entrenamiento
            if sample_weight is not None:
                mlp.fit(Xi_sc, yi, sample_weight=sample_weight)
            else:
                mlp.fit(Xi_sc, yi)
                
            self.pipelines_.append({'scaler': scaler, 'mlp': mlp})
            
        return self

    def predict(self, X):
        X = np.asarray(X, dtype=float)
        preds = []
        for i, pipe in enumerate(self.pipelines_):
            Xi_sc = pipe['scaler'].transform(X)
            yi = pipe['mlp'].predict(Xi_sc)
            
            # Revertir log si aplica
            if i in self.log_targets:
                yi = np.expm1(yi)
            preds.append(yi)
            
        return np.column_stack(preds)

# MODELO COMBINADO HÍBRIDO

class CombinedRadiatorModel:
    def __init__(self, dp_air_model, dp_w_model, dp_air_features, 
                 dp_w_features, mlp_q=None, transformer=None):
        self.dp_air_model = dp_air_model
        self.dp_w_model = dp_w_model
        self.dp_air_features = dp_air_features
        self.dp_w_features = dp_w_features
        self.mlp_q = mlp_q
        self.transformer = transformer

    def predict_dp_air(self, df: pd.DataFrame) -> np.ndarray:
        df = df.copy()
        # Asegurar nombres sin espacios para el modelo lineal
        df.columns = [c.replace(' ', '') for c in df.columns]
        df['Va_squared'] = df['Va(m/s)'] ** 2
        return self.dp_air_model.predict(df[self.dp_air_features])

    def predict_dp_w(self, df: pd.DataFrame) -> np.ndarray:
        df = df.copy()
        df.columns = [c.replace(' ', '') for c in df.columns]
        df['Qw_squared'] = df['Qw(L/m)'] ** 2
        return self.dp_w_model.predict(df[self.dp_w_features])

    def predict_qitd(self, va, qw, full_features_df=None):
        # 1. Intentar usar el modelo Híbrido (MLP) si existe
        mlp_q = getattr(self, 'mlp_q', None)
        transformer = getattr(self, 'transformer', None)

        if mlp_q is not None and transformer is not None and full_features_df is not None:
            # Lógica para el modelo
            X_transformed = transformer.transform(full_features_df)
            q_pred = mlp_q.predict(X_transformed)
            return q_pred[0] if hasattr(q_pred, "__len__") else q_pred

        # 2. Si no hay MLP, intentar usar la fórmula no lineal con A,B,C
        if hasattr(self, 'qitd_A') and hasattr(self, 'qitd_B') and hasattr(self, 'qitd_C'):
            A = self.qitd_A
            B = self.qitd_B
            C = self.qitd_C
            
            #Q = A * (1 - e^{-B*v}) * (1 - e^{-C*Qw})
            q_non_linear = A * (1 - np.exp(-B * va)) * (1 - np.exp(-C * qw))
            return q_non_linear
        
        return 0.0

    def __repr__(self):
        return (f"CombinedRadiatorModel_V7_Hybrid(Linear_DP, MLP_Heat)")
