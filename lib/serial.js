'use strict';
// Conexión USB-serie con el ESP32: lee líneas JSON y escribe comandos. Reconecta sola.
let SerialPort = null;
try { SerialPort = require('serialport').SerialPort; } catch (e) { SerialPort = null; }

const KNOWN_VID = ['10c4', '1a86', '0403', '303a', '067b']; // CP210x, CH340, FTDI, Espressif, PL2303

let cfg = { port: 'auto', baud: 115200 };
let onLine = () => {}, onStatus = () => {};
let port = null, buf = '', timer = null, stopped = false, lastStatus = '';

function status(t, ok) { if (t === lastStatus + (ok ? '1' : '0')) return; lastStatus = t + (ok ? '1' : '0'); try { onStatus(t, !!ok); } catch (e) {} }

async function pick() {
  const { SerialPort: SP } = require('serialport');
  const ports = await SP.list();
  if (cfg.port && cfg.port !== 'auto') return ports.find((p) => p.path.toUpperCase() === String(cfg.port).toUpperCase()) || { path: cfg.port };
  return ports.find((p) => p.vendorId && KNOWN_VID.includes(String(p.vendorId).toLowerCase())) || null;
}

async function connect() {
  if (stopped || port) return;
  if (!SerialPort) { status('Puerto serie no disponible en esta instalación', false); return; }
  let info = null;
  try { info = await pick(); } catch (e) { info = null; }
  if (!info) { status('Buscando el ESP32 por USB…', false); schedule(2500); return; }
  const p = new SerialPort({ path: info.path, baudRate: cfg.baud, autoOpen: false });
  p.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line) { try { onLine(line); } catch (e) {} }
    }
    if (buf.length > 8192) buf = '';
  });
  p.on('close', () => { if (port === p) port = null; buf = ''; status('ESP32 desconectado', false); schedule(1500); });
  p.on('error', () => {});
  p.open((err) => {
    if (err) { status('No se pudo abrir ' + info.path, false); schedule(3000); return; }
    port = p; status('ESP32 conectado (' + info.path + ')', true);
  });
}
function schedule(ms) { clearTimeout(timer); if (!stopped) timer = setTimeout(connect, ms); }

module.exports = {
  start(c, line, st) { cfg = Object.assign(cfg, c); onLine = line; onStatus = st; stopped = false; connect(); },
  restart(c) { cfg = Object.assign(cfg, c); const p = port; port = null; if (p) { try { p.close(); } catch (e) {} } clearTimeout(timer); lastStatus = ''; setTimeout(connect, 200); },
  send(text) { if (!port || !port.isOpen) return false; try { port.write(String(text).replace(/\n*$/, '\n')); return true; } catch (e) { return false; } },
  stop() { stopped = true; clearTimeout(timer); if (port) { try { port.close(); } catch (e) {} port = null; } }
};
