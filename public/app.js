// open-news · Landing + Espacio de trabajo (interfaz open-news_3.html contra la API real).
// Landing: / (status strip). Workspace: /principal · /digital · /banca.
const $ = (sel) => document.querySelector(sel);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fmtHora = (iso) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return String(iso);
  }
};

function limpiar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

const COLOR_RUTA = { pasa: "pasa", con_advertencias: "con_advertencias", retenido: "retenido" };
const COLOR_EVIDENCIA = { suficiente: "suficiente", parcial: "parcial", insuficiente: "insuficiente" };
const PAGE_SIZE = 20;

const EJEMPLOS = {
  principal: ["¿Qué cinco temas merecen revisión hoy?", "¿Qué dice el Banco Mundial sobre la inflación de Panamá?", "Resumen del Canal de Panamá"],
  digital: ["Titulares posibles para hoy", "Resumen web del tema del día", "¿Qué temas son tendencia?"],
  banca: ["Radar de los 9 sectores", "¿Qué dice el Banco Mundial del PIB de Panamá?", "Entorno económico de la banca"],
};

const path = location.pathname.replace(/\/+$/, "") || "/";
const esLanding = path === "/";
const modulo = esLanding ? null : path.split("/").pop() || "principal";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ============ Landing ============
async function cargarEstadoLanding() {
  const strip = $("#status-strip");
  if (!strip) return;
  try {
    const d = await (await fetch("/api/estado")).json();
    strip.textContent = `Snapshot ${d.snapshot ? fmtHora(d.snapshot) : "sin congelar"} · RIUNE ${d.version_reglas} · retenidos ${Object.values(d.retenidos || {}).reduce((a, b) => a + b, 0)}`;
  } catch {
    strip.textContent = "API no disponible";
  }
}

if (esLanding) {
  cargarEstadoLanding();
} else {
  iniciarWorkspace();
}

// ============ Workspace ============
let bandejaItems = [];
let filtros = { tema: "", ruta: "", estado: "" };
let pagina = 1;
let fichaActual = null;
let verificacionActual = null;

function iniciarWorkspace() {
  $("#tabs")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-pane]");
    if (btn) activarPane(btn.dataset.pane);
  });
  $("#btn-producir")?.addEventListener("click", producir);
  $("#consulta-form")?.addEventListener("submit", (ev) => { ev.preventDefault(); consultar($("#consulta-input"), $("#consulta-result")); });
  $("#consulta-form-2")?.addEventListener("submit", (ev) => { ev.preventDefault(); consultar($("#consulta-input-2"), $("#consulta-result-2")); });
  document.querySelectorAll("[data-transicion]").forEach((b) => b.addEventListener("click", () => revisar(b.dataset.transicion)));
  $("#btn-liberar")?.addEventListener("click", () => accionVerificacion("liberar"));
  $("#btn-descartar")?.addEventListener("click", () => accionVerificacion("descartar"));
  renderEjemplos($("#consulta-ejemplos"), EJEMPLOS[modulo] || EJEMPLOS.principal);
  renderEjemplos($("#consulta-ejemplos-2"), EJEMPLOS[modulo] || EJEMPLOS.principal);
  cargarEstadoWorkspace();
  cargarBandeja();
  cargarVerificacion();
}

function activarPane(nombre) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.pane === nombre ? "true" : "false"));
  document.querySelectorAll(".panel-tab").forEach((p) => p.classList.toggle("oculto", p.id !== nombre));
  if (nombre === "verificacion") cargarVerificacion();
  if (nombre === "bandeja") renderBandeja();
}

async function cargarEstadoWorkspace() {
  try {
    const d = await (await fetch("/api/estado")).json();
    const mod = (d.modulos || []).find((m) => m.slug === modulo);
    if (mod) {
      $("#modulo-nombre").textContent = mod.nombre;
      document.body.dataset.modulo = mod.slug;
    }
    const motor = d.motor || {};
    const estadoMotor = motor.disponible === null ? "IA sin probar" : motor.disponible ? "IA disponible" : "IA degradada";
    const retenidos = Object.values(d.retenidos || {}).reduce((a, b) => a + b, 0);
    $("#chip-meta").textContent = `RIUNE ${d.version_reglas} · ${estadoMotor} · ${retenidos} retenidos`;
  } catch {
    $("#chip-meta").textContent = "API no disponible";
  }
}

// ---------- Bandeja (con filtros y paginación) ----------
async function cargarBandeja() {
  $("#meta-bandeja").textContent = "cargando…";
  try {
    const data = await (await fetch(`/api/${modulo}/bandeja?top=500`)).json();
    bandejaItems = data.bandeja || [];
    $("#meta-bandeja").textContent = `${data.total} casos · ${data.retenidos} retenidos`;
    renderFiltros();
    pagina = 1;
    renderBandeja();
  } catch (e) {
    $("#meta-bandeja").textContent = `error: ${e.message}`;
  }
}

function renderFiltros() {
  const cont = $("#filtros");
  if (!cont) return;
  const unicos = (campo) => [...new Set(bandejaItems.map((f) => f[campo]).filter(Boolean))].sort();
  const select = (id, label, opciones) => `
    <label class="sutil" for="${id}" style="align-self:center">${label}</label>
    <select id="${id}"><option value="">todos</option>${opciones.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
  cont.innerHTML = select("f-tema", "Tema", unicos("tema"))
    + select("f-ruta", "Ruta FD", unicos("ruta_fd"))
    + select("f-estado", "Evidencia", unicos("estado_evidencia"));
  $("#f-tema").addEventListener("change", (e) => { filtros.tema = e.target.value; pagina = 1; renderBandeja(); });
  $("#f-ruta").addEventListener("change", (e) => { filtros.ruta = e.target.value; pagina = 1; renderBandeja(); });
  $("#f-estado").addEventListener("change", (e) => { filtros.estado = e.target.value; pagina = 1; renderBandeja(); });
}

function filaHtml(f) {
  const comp = f.componentes || {};
  return `<li><button class="fila" data-id="${esc(f.id_caso)}" ${fichaActual && fichaActual.id_caso === f.id_caso ? 'aria-current="true"' : ""}>
    <span class="puntaje ${f.banda || "medio"}">${f.puntaje ?? "—"}<small>${esc(f.banda || "")}</small></span>
    <span>
      <span class="tit">${esc(f.tema || f.id_caso)}</span>
      <span class="etqs">
        <span class="etq ${COLOR_RUTA[f.ruta_fd] || ""}">${esc(f.ruta_fd || "pasa")}</span>
        <span class="etq ${COLOR_EVIDENCIA[f.estado_evidencia] || ""}">${esc(f.estado_evidencia || "—")}</span>
        <span class="etq det">R=${comp.R ?? "—"} I=${comp.I ?? "—"} U=${comp.U ?? "—"}</span>
      </span>
    </span>
  </button></li>`;
}

function renderBandeja() {
  const lista = $("#lista-bandeja");
  if (!lista) return;
  const items = bandejaItems.filter((f) =>
    (!filtros.tema || f.tema === filtros.tema)
    && (!filtros.ruta || (f.ruta_fd || "pasa") === filtros.ruta)
    && (!filtros.estado || f.estado_evidencia === filtros.estado));
  const paginas = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (pagina > paginas) pagina = paginas;
  const inicio = (pagina - 1) * PAGE_SIZE;
  const slice = items.slice(inicio, inicio + PAGE_SIZE);

  let html = "";
  if (!items.length) {
    html = `<div class="vacio"><b>Sin casos</b>Ningún caso cumple los filtros.</div>`;
  } else if (pagina === 1) {
    const top5 = slice.slice(0, 5);
    const resto = slice.slice(5);
    html += `<div class="separador">Top-5 por RIUNE</div><ol class="lista">${top5.map(filaHtml).join("")}</ol>`;
    if (resto.length) html += `<div class="separador">Siguientes</div><ul class="lista">${resto.map(filaHtml).join("")}</ul>`;
  } else {
    html += `<ul class="lista">${slice.map(filaHtml).join("")}</ul>`;
  }
  html += `<div class="paginacion">
    <button class="btn chico" id="pag-ant" ${pagina <= 1 ? "disabled" : ""}>Anterior</button>
    <span class="sutil">Página ${pagina} de ${paginas}</span>
    <button class="btn chico" id="pag-sig" ${pagina >= paginas ? "disabled" : ""}>Siguiente</button>
  </div>`;
  lista.innerHTML = html;

  lista.querySelectorAll(".fila").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".fila").forEach((x) => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "true");
    cargarFicha(b.dataset.id);
  }));
  $("#pag-ant")?.addEventListener("click", () => { pagina--; renderBandeja(); });
  $("#pag-sig")?.addEventListener("click", () => { pagina++; renderBandeja(); });
}

// ---------- Ficha ----------
async function cargarFicha(id) {
  fichaActual = null;
  $("#ficha-vacio").classList.remove("oculto");
  $("#ficha-cuerpo").classList.add("oculto");
  $("#historial-out").textContent = "Cargando…";
  try {
    const r = await fetch(`/api/${modulo}/ficha/${id}`);
    const f = await r.json();
    if (!r.ok) throw new Error(f.error || "ficha no encontrada");
    fichaActual = f;
    $("#ficha-vacio").classList.add("oculto");
    $("#ficha-cuerpo").classList.remove("oculto");
    $("#ficha-id").textContent = `${f.id_caso} · ${f.procedencias} procedencias · ${fmtHora(f.fecha_original)}`;
    $("#ficha-tema").textContent = f.tema || "Sin tema";

    const etqs = $("#ficha-etqs");
    limpiar(etqs);
    etqs.appendChild(etq(f.ruta_fd || "pasa", COLOR_RUTA[f.ruta_fd] || ""));
    etqs.appendChild(etq(f.estado_evidencia || "—", COLOR_EVIDENCIA[f.estado_evidencia] || ""));
    etqs.appendChild(etq(`RIUNE ${f.version_reglas || ""}`, "estado"));

    const comp = f.componentes || {};
    const riune = $("#ficha-componentes");
    limpiar(riune);
    for (const [k, label] of [["R", "Relevancia"], ["I", "Impacto"], ["U", "Urgencia"], ["N", "Novedad"], ["E", "Evidencia"]]) {
      const v = comp[k] ?? 0;
      const c = document.createElement("div");
      c.className = "comp";
      c.innerHTML = `<span class="l">${label}</span><span class="v">${Number(v).toFixed(2)}</span><div class="barra-c"><span style="width:${Math.min(100, Math.round(v * 100))}%"></span></div>`;
      riune.appendChild(c);
    }
    const total = document.createElement("div");
    total.className = "comp total";
    total.innerHTML = `<span class="l">Puntaje</span><span class="v">${f.puntaje ?? "—"}</span>`;
    riune.appendChild(total);

    const senales = $("#ficha-senales");
    limpiar(senales);
    const det = f.senales_detalle || [];
    if (det.length) {
      det.forEach((s) => {
        const d = document.createElement("div");
        d.className = "senal";
        d.innerHTML = `<b>${esc(s.codigo)}</b> (${esc(s.nivel || "")}) — ${esc(s.razon || "")}`;
        senales.appendChild(d);
      });
    } else {
      senales.innerHTML = `<p class="sutil">Sin señales de credibilidad.</p>`;
    }

    const afirma = $("#ficha-afirmaciones");
    limpiar(afirma);
    const afirmaciones = f.afirmaciones || [];
    if (afirmaciones.length) {
      afirmaciones.forEach((a) => {
        const d = document.createElement("div");
        d.className = "afirm";
        const citas = (a.citas || []).map((c) => `<span class="etq det">${esc(c)}</span>`).join(" ");
        d.innerHTML = `<b>${esc(a.tipo || "hecho")}:</b> ${esc(a.texto)} ${citas}`;
        afirma.appendChild(d);
      });
    }

    $("#btn-exportar").href = `/api/${modulo}/ficha/${id}/exportar`;
    $("#revision-result").classList.add("oculto");
    $("#motivo").value = "";
    actualizarFlujo(f.estado_revision);

    const hrRes = await fetch(`/api/revisiones/${id}`);
    const hr = hrRes.ok ? await hrRes.json() : [];
    $("#historial-out").innerHTML = hr.length
      ? `<ol class="linea-tiempo">${hr.map((rev) => `<li><b>${esc(rev.hacia)}</b> · ${esc(rev.persona || rev.quien || "")}<br><span class="sutil">${fmtHora(rev.fecha)}</span></li>`).join("")}</ol>`
      : "Sin revisiones.";
  } catch (e) {
    $("#ficha-id").textContent = `error: ${e.message}`;
    $("#historial-out").textContent = `error: ${e.message}`;
  }
}

function actualizarFlujo(estado) {
  const actual = norm((estado || "nuevo").replace(/_/g, " "));
  document.querySelectorAll("#flujo-estados span").forEach((s) => {
    s.classList.toggle("actual", norm(s.textContent) === actual);
  });
}

function etq(texto, clase = "") {
  const s = document.createElement("span");
  s.className = `etq ${clase}`.trim();
  s.textContent = texto ?? "—";
  return s;
}

// ---------- Producción ----------
async function producir() {
  if (!fichaActual) return;
  const btn = $("#btn-producir");
  btn.disabled = true;
  btn.textContent = "Produciendo…";
  const panel = $("#borrador");
  panel.classList.remove("oculto");
  panel.textContent = "El agente redacta y el validador V01–V11 decide…";
  try {
    const r = await fetch(`/api/${modulo}/ficha/${fichaActual.id_caso}/entregable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error de producción");
    panel.textContent = JSON.stringify(data.borrador, null, 2);
    $("#entregable-out").textContent = JSON.stringify(data.borrador, null, 2);
  } catch (e) {
    panel.textContent = `error: ${e.message}`;
    $("#entregable-out").textContent = `error: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Producir entregable";
  }
}

// ---------- Consulta ----------
function renderEjemplos(cont, ejemplos) {
  if (!cont) return;
  cont.innerHTML = ejemplos.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("");
  cont.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const input = cont.id === "consulta-ejemplos-2" ? $("#consulta-input-2") : $("#consulta-input");
    const out = cont.id === "consulta-ejemplos-2" ? $("#consulta-result-2") : $("#consulta-result");
    input.value = b.dataset.q;
    consultar(input, out);
  }));
}

async function consultar(input, out) {
  const pregunta = input.value.trim();
  if (!pregunta) return;
  out.classList.remove("oculto");
  out.textContent = "Consultando…";
  try {
    const r = await fetch(`/api/${modulo}/consulta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta: pregunta }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    out.classList.toggle("abstencion", Boolean(data.abstencion));
    out.textContent = data.abstencion
      ? `Abstención explícita. Información necesaria: ${(data.informacion_necesaria || []).join("; ")}`
      : data.respuesta || JSON.stringify(data);
  } catch (e) {
    out.textContent = `error: ${e.message}`;
  }
}

// ---------- Revisión ----------
async function revisar(hacia) {
  if (!fichaActual) return;
  const persona = $("#persona").value.trim();
  const motivo = $("#motivo").value.trim();
  const out = $("#revision-result");
  out.classList.remove("oculto", "error", "ok");
  out.textContent = "Registrando…";
  try {
    const r = await fetch(`/api/${modulo}/ficha/${fichaActual.id_caso}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hacia, persona, detalle: { motivo } }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    out.textContent = `Transición registrada: ${data.revision.desde || "(inicio)"} → ${data.revision.hacia}`;
    out.classList.add("ok");
    $("#motivo").value = "";
    actualizarFlujo(data.revision.hacia);
    await cargarFicha(fichaActual.id_caso);
  } catch (e) {
    out.textContent = `error: ${e.message}`;
    out.classList.add("error");
  }
}

// ---------- Verificación ----------
async function cargarVerificacion() {
  const tbody = $("#tabla-verificacion");
  if (!tbody) return;
  limpiar(tbody);
  const badge = $("#count-retenidos");
  try {
    const data = await (await fetch(`/api/${modulo}/verificacion`)).json();
    if (badge) {
      badge.textContent = data.eventos.length || "";
      badge.classList.toggle("hay", data.eventos.length > 0);
    }
    data.eventos.forEach((f) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `<td>${esc(f.id_caso)}</td><td>${esc(f.tema)}</td><td>${esc((f.senales || []).join(", "))}</td><td>${esc(f.nivel_atencion)}</td><td>seleccionar</td>`;
      tr.addEventListener("click", () => {
        verificacionActual = f;
        document.querySelectorAll("#tabla-verificacion tr").forEach((x) => (x.style.background = ""));
        tr.style.background = "#FFF4CC";
      });
      tbody.appendChild(tr);
    });
  } catch {
    if (badge) badge.textContent = "";
  }
}

async function accionVerificacion(accion) {
  if (!verificacionActual) return alert("Selecciona un evento retenido en la tabla.");
  const motivo = $("#ver-motivo").value.trim();
  const persona = $("#persona").value.trim();
  if (!motivo) return alert("El motivo es obligatorio.");
  try {
    const r = await fetch(`/api/${modulo}/verificacion/${verificacionActual.id_caso}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, motivo, persona }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    $("#ver-motivo").value = "";
    verificacionActual = null;
    cargarVerificacion();
    cargarBandeja();
  } catch (e) {
    alert(`error: ${e.message}`);
  }
}
