# Repomix dividido: el repositorio completo en XML de como máximo 4 MiB

El repositorio entero suma unos 50 MiB y más de 12 millones de tokens: no cabe en una sola ventana de contexto ni siquiera con la configuración optimizada de Repomix (`--remove-comments --remove-empty-lines`), que en este repo ahorra muy poco —medido en igualdad de condiciones: de 12.577.181 a 12.350.901 tokens (−1,8 %) y un 2,3 % de tamaño— porque el volumen está en traducciones, JSON y documentación, no en comentarios. Por eso el proyecto está partido en paquetes XML lógicos que juntos cubren **todos** los archivos de texto versionados.

Generados el 2026-10-20T20:23:23.477Z desde el commit `03629b80f60bda52285f25ae8c0f867e032c1a8a` con `repomix@1.18.1` y las banderas `--style xml --remove-comments --remove-empty-lines --no-git-sort-by-changes --no-default-patterns --no-security-check --token-count-encoding o200k_base`. Los conteos de tokens usan la codificación `o200k_base` de Repomix. Detalle legible por máquina, incluidos SHA-256 y la lista exacta de archivos de cada parte, en `MANIFEST.json`.

> Representación con pérdida deliberada: `--remove-comments --remove-empty-lines` elimina comentarios y líneas vacías del código. Si una tarea necesita los comentarios originales (licencias en cabeceras, explicaciones, `TODO`), hay que regenerar quitando esas dos banderas de `REMOVAL_FLAGS` en el generador; cuesta solo ~2 % más de tokens.

## Cómo usarlos

1. Carga primero `00-raiz-configuracion-y-ci.xml`: trae README, AGENTS, package.json y las reglas del proyecto.
2. Añade solo las partes de la zona en la que vayas a trabajar (dominio, aplicación, proveedores, tests...). Cada XML lleva en su cabecera el mapa completo de partes, así que el modelo sabe qué existe aunque no lo tenga cargado.
3. Las partes `80`, `81` y `90-*` son opcionales y voluminosas; omítelas salvo que la tarea trate exactamente de licencias, releases o traducciones.

## Partes principales

| Archivo | Contenido y cuándo cargarlo | Archivos | Tamaño | Tokens |
| --- | --- | ---: | ---: | ---: |
| `00-raiz-configuracion-y-ci.xml` | **Raíz, configuración y CI**. Cargar primero, siempre: define el proyecto, sus reglas y sus scripts. | 89 | 0,38 MiB | 91.725 |
| `01-src-domain-javascript.xml` | **Dominio: JavaScript**. Trabajar o entender el análisis de aplicaciones y bundles JavaScript. | 217 | 1,93 MiB | 470.583 |
| `02-src-domain-resto.xml` | **Dominio: resto**. Semántica pura del proyecto: modelos, invariantes y proyecciones. | 396 | 2,65 MiB | 651.499 |
| `03-src-application.xml` | **Aplicación (casos de uso)**. Entender qué hace cada comando o herramienta de punta a punta. | 336 | 2,43 MiB | 564.242 |
| `04-src-proveedores-ingenieria-inversa.xml` | **Proveedores de ingeniería inversa**. Integraciones con desensambladores y descompiladores externos. | 171 | 1,74 MiB | 422.553 |
| `05-src-web-navegador-y-capturas.xml` | **Web, navegador y capturas**. Captura y observación web o de red en tiempo de ejecución. | 183 | 1,47 MiB | 351.437 |
| `06-src-plataforma-artefactos-y-formatos.xml` | **Plataforma, artefactos y formatos**. Soporte de un formato concreto o acceso seguro al sistema de archivos. | 283 | 2,47 MiB | 623.174 |
| `07-src-nucleo-servidor-y-cli.xml` | **Núcleo, servidor MCP y CLI**. Entradas del producto, contratos de herramientas y arranque. | 403 | 1,92 MiB | 444.766 |
| `08-tests-boundary-filesystem.xml` | **Tests: boundary/filesystem**. Cambios en lectura o escritura segura y en sus tests. | 196 | 2,06 MiB | 517.192 |
| `09-tests-boundary-proveedores-y-mcp.xml` | **Tests: boundary/providers + mcp**. Contratos de proveedores y del servidor MCP. | 287 | 2,79 MiB | 683.679 |
| `10-tests-boundary-resto.xml` | **Tests: boundary (resto)**. Cobertura de frontera general. | 260 | 2,14 MiB | 522.606 |
| `11-tests-resto.xml` | **Tests: aceptación y otros**. Comportamiento de punta a punta y datos de prueba. | 518 | 2,42 MiB | 616.167 |
| `12-scripts.xml` | **Scripts del repositorio**. Tooling, release y comprobaciones del repositorio. | 403 | 2,47 MiB | 619.948 |
| `13-docs-guias.xml` | **Documentación: guías**. Entender el producto y sus flujos documentados. | 80 | 1,09 MiB | 238.989 |
| `14-website-sin-traducciones.xml` | **Website (sin traducciones)**. Cambios en la web pública. | 71 | 0,99 MiB | 278.803 |
| `15-bridge-native-y-experiments.xml` | **bridge, código nativo y experimentos**. Código que vive dentro de las herramientas externas, o mediciones de eficiencia. | 132 | 1,39 MiB | 326.087 |

## Partes opcionales (contenido voluminoso aislado)

| Archivo | Contenido y cuándo cargarlo | Archivos | Tamaño | Tokens |
| --- | --- | ---: | ---: | ---: |
| `80-opcional-docs-datos.xml` | **OPCIONAL: datos de documentación**. Solo si la tarea trata de releases, evidencias o README localizados. | 37 | 3,19 MiB | 873.960 |
| `81-opcional-licencias-lockfile-y-changelog.xml` | **OPCIONAL: licencias, lockfile y changelog**. Solo para auditoría legal, de dependencias o de historial. | 21 | 1,75 MiB | 581.475 |
| `90-opcional-traducciones-website-a.xml` | **OPCIONAL: traducciones del website**. Solo para trabajar la localización del sitio. | 7 | 2,60 MiB | 737.364 |
| `90-opcional-traducciones-website-b.xml` | **OPCIONAL: traducciones del website**. Solo para trabajar la localización del sitio. | 5 | 3,13 MiB | 917.768 |
| `90-opcional-traducciones-website-c.xml` | **OPCIONAL: traducciones del website**. Solo para trabajar la localización del sitio. | 5 | 3,31 MiB | 923.717 |
| `90-opcional-traducciones-website-d.xml` | **OPCIONAL: traducciones del website**. Solo para trabajar la localización del sitio. | 5 | 3,11 MiB | 922.952 |

**Total: 22 XML, 4.105 archivos de entrada, 47,43 MiB de XML y 12.380.686 tokens.**

## Cobertura: qué queda fuera y por qué

- Contenido no incrustado por ser binario (sí aparece en el árbol de directorios de su XML): `docs/assets/rea-hopper-analysis.png`, `docs/assets/rea-showcases.png`, `website/locales/messages.pot`. Ojo: `messages.pot` es texto gettext, pero Repomix clasifica la extensión `.pot` como binaria (plantilla de PowerPoint) y no ofrece opción para forzarlo; sus `msgid` son los mismos que ya traen los `.po`.
- Submódulos externos sin contenido en este repositorio (solo gitlinks, declarados en `.gitmodules`, parte 00): `third_party/binwalk`, `third_party/ghidra-nativeaot`, `third_party/jadx-headless-mcp`, `third_party/unblob`, `third_party/wakaru`.
- `repomix-output/` y `repomix-output.xml` se autoexcluyen: empaquetarlos dentro de sí mismos crecería en cada regeneración. `node_modules`, `dist` y demás salidas ignoradas por git tampoco son código fuente del repo.
- El chequeo de «secretos» de Repomix está desactivado en estas partes: la entrada son solo archivos ya publicados en este repositorio y el escáner únicamente detecta las credenciales sintéticas (`example.test`) que los fixtures usan para probar la redacción; con el chequeo activo, 10 archivos legítimos desaparecerían en silencio. No reutilices esta configuración sobre código privado sin revisar.
- El `package-lock.json` sí está incluido (parte 81) gracias a `--no-default-patterns` sobre la lista explícita de archivos; una corrida normal de Repomix lo excluiría por patrón.

## El archivo único de la raíz

`repomix-output.xml` (en la raíz, no versionado) se generó con el comando optimizado tal cual:

```bash
npx repomix --style xml --remove-comments --remove-empty-lines
```

Sirve como artefacto único si tu herramienta admite archivos de ese tamaño, pero ten en cuenta que (a) supera los 12 millones de tokens, (b) excluye en silencio el lockfile, `messages.pot`, los binarios y los 10 archivos que el chequeo de secretos marca, y (c) si lo vuelves a correr con esta carpeta presente, incluiría también estos XML partidos salvo que añadas `--ignore "repomix-output/**"`.

## Regenerar

```bash
npm run repomix:split        # o: node scripts/generate-repomix-split.mjs
npm run repomix:plan         # solo imprime el plan de partición, sin generar
```

El generador parte de `git ls-files` (versionados más no ignorados), verifica que la unión de partes cubre cada archivo y que ningún XML supera los 4 MiB, y reescribe esta carpeta. Estos XML son artefactos generados: si el código cambia, regenera en lugar de editarlos. `.gitattributes` los marca como `-text` para que git no normalice los finales de línea del contenido incrustado (hay fixtures `.cmd` con CRLF) y los SHA-256 del manifiesto sigan coincidiendo tras clonar.
