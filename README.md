# 🎮 Stream Overlay & Panel de Host en Vivo

Sistema completo y profesional de **Overlay de Stream (Lower Thirds)** con **Panel de Control de Host en tiempo real**. Diseñado para creadores de contenido, casters, eventos de esports y transmisiones en Kick, Twitch, YouTube y más.

---

## 📸 Características Principales

- **Diseño Cyber / Esports Fiel al Original**:
  - Réplica exacta de la plantilla metálica oscura con biseles iluminados y acentos verde neón (estilo Kick/Cyberpunk).
  - Efecto de destello de luz periódico (*laser shimmer*) que recorre la barra superior.
  - Sombra y brillo neón (*glow*) dinámicos en los textos.
- **Totalmente Dinámico y Editable**:
  - Modifica **Nombre**, **Apodo / Nick**, **Plataforma / Red Social**, **Usuario (@handle)** y **Rol / Cargo** al instante.
  - Soporte para plataformas con badges oficiales: **Kick**, **Twitch**, **YouTube**, **X (Twitter)**, **Instagram**, **TikTok**.
  - Posicionamiento en pantalla configurable: **Inferior Izquierda**, **Inferior Centro**, **Inferior Derecha**.
- **📹 Sistema Multicam & Sala de Videollamadas en Vivo (NUEVO)**:
  - Enlaces de invitación directos (`/guest` o `/call`) para que colaboradores e invitados se unan desde su PC o móvil.
  - Detección automática de cámara, micrófono y vúmetro de audio en tiempo real.
  - Generación automática de **iniciales dinámicas estilo Microsoft Teams** con degradados cyber cuando la persona no tiene o apaga su cámara.
  - Soporte de foto de perfil personalizada opcional.
  - Detección reactiva de habla con halo verde neón pulsante (*speaking glow*).
  - Escenas dinámicas en el overlay de OBS (`/multicam`):
    - **Fondo Transparente en Esquinas / Picture-in-Picture** (Esquina Sup. Der., Inf. Der., Sup. Izq., Barra Lateral, Barra Inferior) para transmitir de fondo gameplay o cámara principal.
    - **Mosaico Completo (Grid)** autoajustable según el número de participantes (1 a 6 personas).
  - Control de producción desde el Panel de Host: ocultar/mostrar cualquier cámara individualmente, expulsar usuarios y monitorear la llamada en vivo.
- **Panel de Control del Host (WebSockets en Tiempo Real)**:
  - Disparo de overlay con latencia cero con **Socket.io**.
  - **Monitor OBS en vivo**: Previsualiza cómo se ve el overlay en pantalla en tiempo real desde el panel.
  - Botón maestro **MOSTRAR EN VIVO** y **OCULTAR**.
  - Selector de **Auto-Ocultar**: Manual, 5s, 8s, 10s, 15s.
  - Deck de tarjetas con todos los presentadores guardados: lanza a cualquiera al stream con un solo clic.
  - Persistencia automática en disco (`data/presenters.json`), no pierdes los datos al reiniciar.
  - Atajos de teclado: **Barra Espaciadora** para alternar Mostrar/Ocultar, teclas **1 a 9** para lanzar presentadores rápidos.
- **Listo para Railway y Dominio Personalizado**:
  - Configurado con `package.json`, `Procfile` y `railway.json`.
  - Detección automática de puerto dinámico (`process.env.PORT`).

---

## 🚀 Estructura del Proyecto

```
app stream/
├── public/
│   ├── assets/
│   │   ├── overlay-frame-clean.png    # Marco base limpio de alta fidelidad
│   │   └── reference-banner.png       # Imagen original de referencia
│   ├── css/
│   │   └── overlay.css                # Estilos, fuentes y animaciones cyber
│   ├── js/
│   │   ├── admin.js                   # Lógica del panel de control
│   │   └── overlay.js                 # Lógica del navegador de OBS
│   ├── index.html                     # Panel de Host para el streamer/productor
│   └── overlay.html                   # Fuente de navegador para OBS Studio
├── data/
│   └── presenters.json                # Base de datos persistente de presentadores
├── Procfile                           # Archivo de inicio para despliegue
├── railway.json                       # Configuración de despliegue para Railway
├── package.json
└── server.js                          # Servidor Node.js + Express + Socket.io
```

---

## 🛠️ Ejecución Local

1. Asegúrate de tener **Node.js (v18 o superior)** instalado.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor:
   ```bash
   npm start
   ```
4. Abre en tu navegador:
   - **Panel de Host**: [http://localhost:3000](http://localhost:3000)
   - **Overlay para OBS**: [http://localhost:3000/overlay](http://localhost:3000/overlay)

---

## 🌐 Subir a tu Repositorio de GitHub

Para subir este proyecto a tu cuenta de GitHub:

1. Crea un nuevo repositorio en [GitHub](https://github.com/new) (por ejemplo: `stream-overlay-app`).
2. En tu terminal, ejecuta los siguientes comandos dentro de esta carpeta:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

---

## 🚂 Despliegue en Railway con Dominio Personalizado

1. Entra a [Railway.app](https://railway.app/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"New Project"** -> **"Deploy from GitHub repo"**.
3. Selecciona tu repositorio recién creado.
4. Railway detectará automáticamente la aplicación Node.js e iniciará el despliegue con `npm start`.
5. **Configurar tu dominio personalizado**:
   - En el panel del servicio en Railway, ve a la pestaña **Settings**.
   - En la sección **Networking** -> **Custom Domain**:
     - Haz clic en **Add Domain** y escribe tu subdominio (ej: `stream.tudominio.com` u `overlay.tudominio.com`).
     - Railway te mostrará el registro DNS (tipo `CNAME`) que debes agregar en el panel de tu proveedor de dominio (Cloudflare, Namecheap, GoDaddy, etc.).
     - ¡En cuestión de minutos tendrás tu app con certificado SSL HTTPS automático!

---

## 🎥 Configuración en OBS Studio / Streamlabs

### 1. Overlay Principal de Presentadores
- **URL**: `http://localhost:3000/overlay` (o tu dominio en producción)
- **Ancho**: `1920` | **Alto**: `1080` | **FPS**: `60`

### 2. Overlay Multicam & Videollamadas (Cámaras de Invitados)
- **URL**: `http://localhost:3000/multicam`
- **Ancho**: `1920` | **Alto**: `1080` | **FPS**: `60`
- **Consejo para modo de esquina transparente**: Coloca esta fuente de navegador por encima de tu captura de juego, ventana o cámara de streamer. Las cámaras de los invitados se sobreexpondrán en la esquina configurada sin tapar el fondo.

### 3. Enlace para Invitados y Colaboradores
- **URL**: `http://localhost:3000/guest` (o `https://tu-dominio.com/guest`)
- Los invitados acceden desde su navegador (PC o celular), configuran su nombre, cámara, micrófono o foto/iniciales automáticas estilo Teams y se unen al stream con latencia ultrabaja.
