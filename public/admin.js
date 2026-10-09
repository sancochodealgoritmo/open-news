"use strict";

const $ = (id) => document.getElementById(id);

let estado = null; // { catalogo, actuales, sobrescritos, feeds, version }

function aviso(texto, tipo = "neutro") {
  const el = $("aviso");
  el.innerHTML = `<div class="mensaje ${tipo}">${texto}</div>`;
}

async function cargar() {
  const r = await fetch("/api/admin/config");
  estado = await r.json();
  $("version").textContent = estado.version;
  renderSecciones();
  renderFeeds();
}

function seccionDe(clave) {
  return estado.catalogo.find((c) => c.clave === clave)?.seccion || "General";
}

function renderSecciones() {
  const cont = $("secciones");
  cont.innerHTML = "";
  const porSeccion = {};
  for (const campo of estado.catalogo) {
    (porSeccion[campo.seccion] ||= []).push(campo);
  }
  for (const [seccion, campos] of Object.entries(porSeccion)) {
    const caja = document.createElement("div");
    caja.className = "caja";
    const h = document.createElement("h2");
    h.textContent = seccion;
    caja.appendChild(h);
    for (const campo of campos) {
      const esOver = campo.clave in estado.sobrescritos;
      const div = document.createElement("div");
      div.className = "campo";
      const val = estado.actuales[campo.clave];
      const label = document.createElement("label");
      if (esOver) label.classList.add("over");
      label.textContent = `${campo.descripcion} (${campo.clave})${esOver ? " · sobrescrito" : ""}`;
      label.htmlFor = `campo-${campo.clave}`;
      div.appendChild(label);

      let input;
      if (campo.tipo === "json") {
        input = document.createElement("textarea");
        input.value = JSON.stringify(val ?? []);
      } else if (campo.tipo === "number") {
        input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = val ?? "";
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = val ?? "";
      }
      input.id = `campo-${campo.clave}`;
      input.dataset.clave = campo.clave;
      input.dataset.tipo = campo.tipo;
      div.appendChild(input);
      caja.appendChild(div);
    }
    cont.appendChild(caja);
  }
}

function renderFeeds() {
  const tbody = document.querySelector("#tabla-feeds tbody");
  tbody.innerHTML = "";
  for (const feed of estado.feeds) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-f="medio" value="${esc(feed.medio || "")}"></td>
      <td><input data-f="familia" class="chico" value="${esc(feed.familia || "")}"></td>
      <td><input data-f="nivel" class="chico" value="${esc(feed.nivel || "")}"></td>
      <td><input data-f="url_feed" value="${esc(feed.url_feed || "")}"></td>
      <td><input data-f="activo" type="checkbox" ${feed.activo !== false ? "checked" : ""}></td>
      <td><button class="btn chico peligro" data-quitar>Quitar</button></td>`;
    tbody.appendChild(tr);
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function recogerAjustes() {
  const ajustes = {};
  for (const input of document.querySelectorAll("[data-clave]")) {
    const clave = input.dataset.clave;
    const tipo = input.dataset.tipo;
    try {
      if (tipo === "json") {
        ajustes[clave] = JSON.parse(input.value);
      } else if (tipo === "number") {
        ajustes[clave] = Number(input.value);
      } else {
        ajustes[clave] = input.value;
      }
    } catch (e) {
      throw new Error(`Clave ${clave}: ${e.message}`);
    }
  }
  return ajustes;
}

function recogerFeeds() {
  const feeds = [];
  for (const tr of document.querySelectorAll("#tabla-feeds tbody tr")) {
    const leer = (f) => tr.querySelector(`[data-f="${f}"]`);
    feeds.push({
      medio: leer("medio").value.trim(),
      familia: leer("familia").value.trim(),
      nivel: leer("nivel").value.trim(),
      url_feed: leer("url_feed").value.trim(),
      activo: leer("activo").checked,
    });
  }
  return feeds;
}

$("guardar").addEventListener("click", async () => {
  try {
    const ajustes = recogerAjustes();
    const feeds = recogerFeeds();
    const r = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ajustes, feeds }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Error al guardar");
    aviso(`Guardado · versión ${data.version} · ${data.aplicados.length} ajuste(s)`, "ok");
    await cargar();
  } catch (e) {
    aviso(e.message, "error");
  }
});

$("restablecer").addEventListener("click", async () => {
  if (!confirm("¿Restablecer toda la configuración a DEFAULTS?")) return;
  const r = await fetch("/api/admin/config/restablecer", { method: "POST" });
  const data = await r.json();
  if (!r.ok) return aviso(data.error || "Error", "error");
  aviso(`Restablecido a DEFAULTS · versión ${data.version}`, "ok");
  await cargar();
});

$("sync").addEventListener("click", async () => {
  $("notion-out").textContent = "Sincronizando…";
  const r = await fetch("/api/admin/config/sync", { method: "POST" });
  const data = await r.json();
  $("notion-out").textContent = JSON.stringify(data, null, 2);
  aviso("Sincronización desde Notion completada (best-effort).", "ok");
});

$("agregar-feed").addEventListener("click", () => {
  estado.feeds.push({ medio: "", familia: "", nivel: "", url_feed: "", activo: true });
  renderFeeds();
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-quitar]");
  if (!btn) return;
  btn.closest("tr").remove();
});

cargar().catch((e) => aviso(`No se pudo cargar la configuración: ${e.message}`, "error"));
