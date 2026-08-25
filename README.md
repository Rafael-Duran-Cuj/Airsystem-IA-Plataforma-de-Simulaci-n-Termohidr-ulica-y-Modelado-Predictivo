# Airsystem: Thermo-Hydraulic Modeling 

Este repositorio contiene el código fuente y la arquitectura de modelos de machine learning para el proyecto de simulación y predicción termohidráulica de Airsystem. El sistema está diseñado para evaluar el rendimiento de sistemas térmicos mediante el uso de algoritmos de inteligencia artificial.

## Descripción del Proyecto

El núcleo del proyecto se centra en predecir tres variables operacionales críticas:
* **Disipación de calor:** $Q_{itd}$
* **Caída de presión del aire:** $\Delta p_{air}$
* **Caída de presión del agua:** $\Delta p_{w}$

Para lograr alta fidelidad técnica, el motor de predicción combina dos enfoques:
1. **Gradient Boosting Regressors:** Para capturar relaciones no lineales complejas en los datos experimentales y tabulares.
2. **Physics-Informed Neural Networks (PINNs):** Para asegurar que las predicciones de la red neuronal respeten las leyes de conservación de energía y termodinámica, reduciendo el espacio de búsqueda del modelo y mejorando la generalización.

## Requisitos Previos

El entorno está configurado para ejecutarse en infraestructuras locales o servidores on-premise, sin dependencias de servicios cloud externos. Asegúrate de tener instalado Python 3.10 o superior.

## Instalación

1. Clona este repositorio en tu entorno local (ej. distribución Linux).
   git clone [https://github.com/tu-usuario/airsystem-modeling.git](https://github.com/tu-usuario/airsystem-modeling.git)
   cd airsystem-modeling

2. Crea y activa un entorno virtual:
   python3 -m venv venv
   source venv/bin/activate

3. Instala las dependencias estrictas del proyecto:
   pip install -r requirements.txt

## Estructura del Código
/data: Scripts de preprocesamiento de datos (limpieza de CSVs/Excel).
/models: Definición de arquitecturas. Contiene los scripts de entrenamiento para los ensambles (XGBoost/Scikit-learn) y los tensores de PyTorch para las PINNs.
/notebooks: Análisis exploratorio y evaluación de métricas de rendimiento ($R^2$, RMSE).
/docs: Documentación técnica (código fuente en LaTeX del marco teórico).

## Ejecución del Entrenamiento

Para iniciar el pipeline de entrenamiento de los regresores:
python -m models.train_boosting

Para entrenar la red neuronal informada por la física:

python -m models.train_pinn

