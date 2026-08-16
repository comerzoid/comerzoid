# COMERZOID — proyecto listo para publicar

Este proyecto ya tiene Firebase conectado (base de datos: `comerzoid-efd7f`).
Sigue estos pasos para publicarlo gratis en internet.

## 1. Sube este proyecto a GitHub
1. Entra a https://github.com y crea una cuenta gratis si no tienes.
2. Crea un repositorio nuevo (botón "New repository"), llámalo `comerzoid`, y déjalo **público** o **privado**, como prefieras.
3. Sube TODOS los archivos de esta carpeta a ese repositorio (puedes arrastrar los archivos directamente en la página de GitHub si no usas la terminal).

## 2. Conecta con Vercel
1. Entra a https://vercel.com y crea una cuenta gratis usando tu cuenta de GitHub.
2. Haz clic en "Add New... > Project".
3. Selecciona el repositorio `comerzoid` que acabas de subir.
4. Vercel detectará automáticamente que es un proyecto Vite/React. No necesitas cambiar nada, solo dale clic en "Deploy".
5. En unos 2 minutos tendrás tu link listo, algo como `comerzoid.vercel.app`.

## 3. Prueba la tienda
- La tienda pública funciona sin login.
- Vendedor demo: PIN `1111`
- Admin: PIN `1234`

**Importante:** cambia el PIN de administrador desde el Panel Admin > Configuración
en cuanto puedas, para que nadie más entre con el PIN de ejemplo.

## 4. Más adelante: dominio propio
Cuando quieras usar un dominio como `comerzoid.com`:
1. Cómpralo en un registrador (ej. Namecheap).
2. En Vercel, ve a tu proyecto > Settings > Domains, y agrega el dominio.
3. Vercel te dará unos registros DNS para pegar en el panel de tu registrador.

## Nota de seguridad
Las reglas de Firestore están abiertas (`allow read, write: if true`) para que
todo funcione rápido desde el inicio. Antes de manejar ventas reales en volumen,
conviene restringirlas más. Pregúntame cuando llegues a ese punto y te ayudo.
