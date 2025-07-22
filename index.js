const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const uri = "mongodb+srv://paginaswebsgs:xFjHRGbFHHIw4YAB@database.ocbrszk.mongodb.net/tlpHorarios?retryWrites=true&w=majority";

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

    // Eliminar password antes de enviar al cliente
    const { password: pwd, ...usuarioSinPass } = usuario;

    res.json({ mensaje: "Login correcto", usuario: usuarioSinPass });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error en el servidor" });
  }
});

app.put('/usuarios/:usuarioId/horarios/:mes/:dia', async (req, res) => {
  const { usuarioId, mes, dia } = req.params;
  const { entrada: entradaVieja, salida: salidaVieja } = req.query; // horario original para buscar
  const { entrada: entradaNueva, salida: salidaNueva } = req.body; // nuevos valores para actualizar

  if (!entradaVieja || !salidaVieja) {
    return res.status(400).json({ error: 'Faltan parámetros entrada o salida originales para identificar el horario' });
  }
  if (!entradaNueva || !salidaNueva) {
    return res.status(400).json({ error: 'Faltan nuevos valores de entrada o salida para actualizar' });
  }

  // Conversor de "HH:mm" a minutos
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

    // Verificar solapamiento con otros horarios del mismo día (ignorando el que se está editando)
    const entradaNuevaMin = timeToMinutes(entradaNueva);
    const salidaNuevaMin = timeToMinutes(salidaNueva);

    const solapamiento = mesHorario.dias.some(d => {
      if (d.dia !== dia) return false; // otro día, no interesa

      // Ignorar el horario que se está editando
      if (d.entrada === entradaVieja && d.salida === salidaVieja) return false;

      const eMin = timeToMinutes(d.entrada);
      const sMin = timeToMinutes(d.salida);

      return entradaNuevaMin < sMin && salidaNuevaMin > eMin;
    });

    if (solapamiento) {
      return res.status(400).json({ error: 'El nuevo horario se solapa con otro horario asignado en ese día' });
    }

    // Actualizar el horario específico
    let encontrado = false;

    const nuevosDias = mesHorario.dias.map(d => {
      if (d.dia === dia && d.entrada === entradaVieja && d.salida === salidaVieja) {
        encontrado = true;
        return { dia, entrada: entradaNueva, salida: salidaNueva };
      }
      return d;
    });

    if (!encontrado) {
      return res.status(404).json({ error: 'Horario no encontrado para actualizar' });
    }

    const horariosActualizados = usuario.horarios.map(h => {
      if (h.mes === mes) {
        return { ...h, dias: nuevosDias };
      }
      return h;
    });

    const resultado = await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: horariosActualizados } }
    );

    if (resultado.modifiedCount === 0) {
      return res.status(500).json({ error: 'No se pudo actualizar el horario' });
    }

    res.json({ mensaje: 'Horario actualizado correctamente' });

  } catch (error) {
    console.error('Error al actualizar horario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});



//funciona
app.delete('/usuarios/:usuarioId/horarios/:mes/:dia', async (req, res) => {
  const { usuarioId, mes, dia } = req.params;
  const { entrada, salida } = req.query;

  console.log('Parámetros recibidos:', { usuarioId, mes, dia, entrada, salida });

  if (!entrada || !salida) {
    return res.status(400).json({ error: 'Faltan parámetros entrada o salida' });
  }

  try {
    const usuario = await collection.findOne({ _id: usuarioId });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    console.log('Usuario encontrado:', usuario.nombre);

    const mesHorario = usuario.horarios.find(h => h.mes === mes);

    if (!mesHorario) {
      return res.status(404).json({ error: 'Mes no encontrado' });
    }

    const nuevosDias = mesHorario.dias.filter(d => !(d.dia === dia && d.entrada === entrada && d.salida === salida));

    if (nuevosDias.length === mesHorario.dias.length) {
      return res.status(404).json({ error: 'Horario no encontrado para eliminar' });
    }

    const horariosActualizados = usuario.horarios.map(h => {
      if (h.mes === mes) {
        return { ...h, dias: nuevosDias };
      }
      return h;
    });

    const resultado = await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: horariosActualizados } }
    );

    if (resultado.modifiedCount === 0) {
      return res.status(500).json({ error: 'No se pudo eliminar el horario' });
    }

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

  // Función para convertir tiempo "HH:mm" a minutos desde medianoche
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

    // Filtrar horarios en ese día (no es necesario checar usuarioId dentro porque es del mismo usuario)
    const horariosEnDiaUsuario = mesHorario.dias.filter(d => d.dia === dia);

    // Validar que no haya más de dos horarios
    if (horariosEnDiaUsuario.length >= 2) {
      return res.status(400).json({ error: 'No puedes asignar más de dos horarios en un día para este usuario' });
    }

    // Evitar duplicados exactos
    const horarioDuplicado = horariosEnDiaUsuario.find(
      d => d.entrada === entrada && d.salida === salida
    );
    if (horarioDuplicado) {
      return res.status(400).json({ error: 'Este horario ya está asignado para este usuario en este día' });
    }

    // Verificar solapamiento
    const entradaMinutos = timeToMinutes(entrada);
    const salidaMinutos = timeToMinutes(salida);

    const haySolapamiento = horariosEnDiaUsuario.some(({ entrada: e, salida: s }) => {
      const eMin = timeToMinutes(e);
      const sMin = timeToMinutes(s);

      // Condición de solapamiento:
      // El nuevo horario empieza antes de que termine otro, y termina después de que empieza otro
      return entradaMinutos < sMin && salidaMinutos > eMin;
    });

    if (haySolapamiento) {
      return res.status(400).json({ error: 'El horario se solapa con otro ya asignado para este usuario en este día' });
    }

    // Añadir nuevo horario
    mesHorario.dias.push({ dia, entrada, salida });

    const resultado = await collection.updateOne(
      { _id: usuarioId },
      { $set: { horarios: usuario.horarios } }
    );

    if (resultado.modifiedCount === 0) {
      return res.status(500).json({ error: 'No se pudo crear el horario' });
    }

    res.status(201).json({ mensaje: 'Horario creado correctamente' });

  } catch (error) {
    console.error('Error al crear horario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});










const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`API corriendo en puerto ${PORT}`));
