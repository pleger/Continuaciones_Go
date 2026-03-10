# Web IDE de Timepoints

Esta carpeta contiene una interfaz web estilo IDE para:

- ejecutar codigo JavaScript,
- crear timepoints (explícitos o implícitos),
- visualizar la ejecucion en una linea de tiempo,
- reanudar la reproduccion desde un timepoint seleccionado.

## Ejecutar localmente

Opcion A (simple): abrir directamente el archivo:

- `web_ide_timepoint/index.html`

Opcion B (recomendada) con servidor local:

```bash
cd web_ide_timepoint
python3 -m http.server 8080
```

Abrir en navegador: `http://localhost:8080`

## Flujo de uso

1. Escribe o pega codigo en **Panel 1 (Source code)**.
2. Crea timepoints explicitos haciendo click en numeros de linea del gutter.
3. En **Panel 6 (Settings)** selecciona modo:
   - `Explicit`: solo lineas marcadas.
   - `Implicit`: cada linea ejecutada genera timepoint.
4. Pulsa **Ejecutar**.
5. Revisa logs en **Panel 2 (Output)**.
6. Revisa nodos en **Panel 4 (Timeline)**.
7. Haz click en un nodo de timeline para seleccionar un timepoint.
8. Pulsa **Resumir desde TP** para reproducir desde ese punto de la ejecucion.

## Paneles (similar a la imagen objetivo)

- **Panel 1**: editor de codigo con gutter clickeable.
- **Panel 2**: salida de consola y errores.
- **Panel 3**: watch variables (agregar/remover).
- **Panel 4**: linea de tiempo con timepoints ejecutados.
- **Panel 5**: snapshot de variables del timepoint seleccionado.
- **Panel 6**: configuracion de modo, velocidad y controles de ejecucion.

## Como funciona internamente

- El codigo se transforma en el navegador para inyectar hooks por linea.
- Cada hook puede crear un timepoint con snapshot del estado (`runtimeState`).
- El timeline se construye con `{linea, tiempo, nombre, snapshot}`.
- `Resumir desde TP` reproduce la traza desde el timepoint elegido para analizar la ejecucion desde ese punto.

## Limitaciones actuales

- Es un motor ligero de demo en navegador (no reemplaza un debugger completo).
- El editor ejecuta JavaScript instrumentado en cliente.
- Algunos patrones complejos de sintaxis pueden requerir ajustes adicionales del transformador.
