# 📊 Analisis Programación Obras ENUE

> **"Tu Cronograma, Visualizado."**
> Una aplicación web de alto rendimiento para la extracción, análisis y visualización de datos de planificación de obras desde archivos Gantt (Excel/CSV).

[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

---

## 🎨 Características Principales

### 📁 Gestión Inteligente de Archivos

- **Arrastrar y Soltar**: Sube tus archivos `.xlsx`, `.xls` o `.csv` directamente al navegador.
- **Mapeo Adaptativo**: Interfaz para asignar columnas de tu Excel (Tarea, Inicio, Fin, WBS, etc.) de forma manual o automática.
- **Sincronización en la Nube**: Integración con **Vercel Blob** para compartir y respaldar cronogramas dinámicamente.

### 📈 Dashboard & Analítica Pro

- **Visualización de Salud**: Resumen ejecutivo del estado del portafolio y proyectos individuales.
- **Radar de Cuellos de Botella**: Identifica visualmente qué áreas están impactando la ruta crítica mediante gráficos de radar interactivos.
- **Tabla de Tareas Pro**: Gestión avanzada con filtrado inteligente, detección automática de avances e indicadores de retraso.

### 💾 Persistencia y Seguridad

- **PWA Ready**: Funciona de forma local con **IndexedDB** (vía Dexie) para garantizar el acceso off-line y guardado automático.
- **Modo Privado**: Los datos se almacenan localmente en tu navegador para máxima confidencialidad.

---

## 🛠️ Stack Tecnológico

- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/) (Glassmorphism & Dark Mode)
- **Componentes UI**: [Radix UI](https://www.radix-ui.com/) + [Lucide Icons](https://lucide.dev/)
- **Estado**: [Zustand](https://zustand.docs.pmnd.rs/) (Sincronizado con almacenamiento local)
- **Base de Datos**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Gráficos**: [Recharts](https://recharts.org/)
- **Parseo Excel**: [SheetJS (XLSX)](https://sheetjs.com/)

---

## 🚀 Inicio Rápido

1. **Clonar el repositorio**:

   ```bash
   git clone <repo-url>
   ```

2. **Instalar dependencias**:

   ```bash
   npm install
   ```

3. **Ejecutar en desarrollo**:

   ```bash
   npm run dev
   ```

---

## 📂 Estructura del Proyecto

```text
src/
├── api/             # Endpoints backend (Vercel Serverless)
├── components/      # Componentes UI reutilizables
│   ├── ui/          # Elementos básicos (Tooltips, Modales)
│   ├── Dashboard/   # Vistas principales del dashboard
│   └── FileUpload/  # Lógica de carga y parseo de Excel
├── lib/             # Utilidades y configuración de librerías
├── store/           # Estado global con Zustand
├── types/           # Definiciones de TypeScript
└── db.ts            # Configuración de Dexie (IndexedDB)
```

---

## 📅 Hoja de Ruta (Roadmap)

- [x] Soporte para múltiples archivos simultáneos.
- [x] Filtros por ruta crítica y porcentajes de avance.
- [ ] Exportación de reportes en PDF.
- [ ] Integración con MS Project API.

---

Desarrollado con ❤️ por el equipo de **Analisis Programación ENUE**.
