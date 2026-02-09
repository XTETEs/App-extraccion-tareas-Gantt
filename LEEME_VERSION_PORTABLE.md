# Notas sobre la Versión Portátil

## Funcionalidad Offline

Esta aplicación ha sido empaquetada para funcionar **100% offline** (localmente) sin necesidad de servidor ni conexión a internet.

Puedes llevarte la carpeta `dist` en un USB o enviarla por correo, y funcionará en cualquier ordenador moderno simplemente abriendo el archivo `index.html`.

### ¿Funciona la "Inteligencia Artificial"?

Es importante clarificar qué partes de la aplicación son "inteligentes" y cuáles dependen del asistente externo:

1. **SÍ Funcionan (Lógica Interna)**:
    * **Análisis y Cálculos**: La valoración teórica, el radar de retrasos, los KPIs y las previsiones de cierre funcionan perfectamente. Son fórmulas matemáticas ejecutadas por tu navegador.
    * **Gestión de Datos**: La lectura de Excel, filtros, búsqueda y organización de tareas es totalmente funcional.
    * **Interactividad**: Gráficos, tablas y menús siguen siendo interactivos.

2. **NO Funcionan (Requieren Nube)**:
    * **El Chat con el Asistente**: El asistente que te ha ayudado a programar esto (yo) vive en la nube (AI Studio). No podrás chatear con la aplicación para pedir cambios de código o explicaciones en el ordenador de destino.
    * **RAG / Consultas de Documentación**: La app no consulta bases de datos vectoriales externas ni documentación en PDF. Todo lo que ves se genera exclusivamente a partir de los datos del Excel que subas.

## Instrucciones de Uso

1. Copia la carpeta `dist`.
2. Abre `index.html` en Google Chrome, Edge o Firefox.
3. Arrastra tu Excel de planificación.
