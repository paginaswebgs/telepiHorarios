const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri);
let collection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("tlpHorarios");
    collection = db.collection("tlpUser");
    console.log("Conectado a MongoDB Atlas en tlpHorarios.tlpUser");
  } catch (error) {
    console.error("Error conectando a MongoDB", error);
  }
}

connectDB();

app.get("/", (req, res) => {
  res.send("API funcionando correctamente");
});

app.get("/usuarios", async (req, res) => {
  try {
    const usuarios = await collection.find({}).toArray();
    res.json(usuarios);
  } catch (error) {
    res.status(500).send({ mensaje: "Error al obtener usuarios" });
  }
});

app.post("/login", async (req, res) => {
  const { dni, password } = req.body;

  try {
    const usuario = await collection.findOne({ _id: dni });

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    if (usuario.password !== password) {
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    }

    const { password: pwd, ...usuarioSinPass } = usuario;
    res.json({ mensaje: "Login correcto", usuario: usuarioSinPass });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error en el servidor" });
  }
});

app.put('/usuarios/:usuarioId/horarios/:mes/:dia', async (req, res) => {
  const { usuarioId, mes, dia } = req.params;
  const { entrada: entradaVieja, salida: salidaVieja } = req.query;
  const { entrada: entradaNueva, salida: salidaNueva } = req.body;

  if (!entradaVieja || !salidaVieja || !entradaNueva || !salidaNueva) {
    return res.status(400).json({ error: 'Faltan parámetros necesarios' });
  }

  const timeToMinutes = (time) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  try {
    const usuario = await collection.findOne({ _id: usuarioId });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const mesHorario = usuario.horarios.find(h => h.mes === mes);
    if (!mesHorario) {
      return res.status(404).json({ error: 'Mes no encontrado' });
    }

    const entradaNuevaMin = timeToMinutes(entradaNueva);
    const salidaNuevaMin = timeToMinutes(salidaNueva);

    const solapamiento = mesHorario.dias.some(d => {
      if (d.dia !== dia) return false;
      if (d.entrada === entradaVieja && d.salida === salidaVieja) return false;

      const eMin = timeToMinutes(d.entrada);
      const sMin = timeToMinutes(d.salida);
      return entradaNuevaMin < sMin && salidaNuevaMin > eMin;
    });

    if (solapamiento) {
      return res.status(400).json({ error: 'Horario solapado' });
    }

    let encontrado = false;
    const nuevosDias = mesHorario.dias.map(d => {
      if (d.dia === dia && d.entrada === entradaVieja && d.salida === salidaVieja) {
        encontrado = true;
        return { dia, entrada: entradaNueva, salida: salidaNueva };
      }
      return d;
    });

    if (!encontrado) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    const horariosActualizados = usuario.horarios.map(h =>
      h.mes === mes ? { ...h, dias: nuevosDias } : h
    );

    const resultado = await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: horariosActualizados } }
    );

    res.json({ mensaje: 'Horario actualizado correctamente' });

  } catch (error) {
    console.error('Error al actualizar horario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.delete('/usuarios/:usuarioId/horarios/:mes/:dia', async (req, res) => {
  const { usuarioId, mes, dia } = req.params;
  const { entrada, salida } = req.query;

  if (!entrada || !salida) {
    return res.status(400).json({ error: 'Faltan parámetros entrada o salida' });
  }

  try {
    const usuario = await collection.findOne({ _id: usuarioId });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const mesHorario = usuario.horarios.find(h => h.mes === mes);
    if (!mesHorario) {
      return res.status(404).json({ error: 'Mes no encontrado' });
    }

    const nuevosDias = mesHorario.dias.filter(d => !(d.dia === dia && d.entrada === entrada && d.salida === salida));

    if (nuevosDias.length === mesHorario.dias.length) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    const horariosActualizados = usuario.horarios.map(h =>
      h.mes === mes ? { ...h, dias: nuevosDias } : h
    );

    await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: horariosActualizados } }
    );

    res.json({ mensaje: 'Horario eliminado correctamente' });

  } catch (error) {
    console.error('Error al eliminar horario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/usuarios/:usuarioId/horarios/:mes/:dia', async (req, res) => {
  const { usuarioId, mes, dia } = req.params;
  const { entrada, salida } = req.body;

  if (!entrada || !salida) {
    return res.status(400).json({ error: 'Faltan entrada o salida' });
  }

  const timeToMinutes = (time) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  try {
    const usuario = await collection.findOne({ _id: usuarioId });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    let mesHorario = usuario.horarios.find(h => h.mes === mes);
    if (!mesHorario) {
      mesHorario = { mes, dias: [] };
      usuario.horarios.push(mesHorario);
    }

    const horariosEnDia = mesHorario.dias.filter(d => d.dia === dia);

    if (horariosEnDia.length >= 2) {
      return res.status(400).json({ error: 'Máximo 2 horarios por día' });
    }

    if (horariosEnDia.some(d => d.entrada === entrada && d.salida === salida)) {
      return res.status(400).json({ error: 'Horario duplicado' });
    }

    const entradaMin = timeToMinutes(entrada);
    const salidaMin = timeToMinutes(salida);

    if (horariosEnDia.some(d => {
      const eMin = timeToMinutes(d.entrada);
      const sMin = timeToMinutes(d.salida);
      return entradaMin < sMin && salidaMin > eMin;
    })) {
      return res.status(400).json({ error: 'Horario solapado' });
    }

    mesHorario.dias.push({ dia, entrada, salida });

    await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: usuario.horarios } }
    );

    res.status(201).json({ mensaje: 'Horario creado correctamente' });

  } catch (error) {
    console.error('Error al crear horario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`API corriendo en puerto ${PORT}`));
