"""Prueba las reglas de la base de datos con casos reales del local.
Todo corre dentro de una transacción que se deshace al final: no deja datos.

Uso: python pruebas/probar_base_de_datos.py "postgres://usuario:clave@host:puerto/base"
(o con la variable DATABASE_URL). Necesita: pip install "psycopg[binary]"."""
import os, sys
import psycopg

URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('DATABASE_URL')
if not URL:
    sys.exit('Falta la dirección de la base (argumento o DATABASE_URL).')
fallas = []


def check(cond, msg):
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        fallas.append(msg)


def rechaza(cur, sql, params, msg):
    """La base tiene que rechazar esta operación."""
    cur.execute('SAVEPOINT intento')
    try:
        cur.execute(sql, params)
        check(False, msg)
    except psycopg.Error:
        check(True, msg)
    cur.execute('ROLLBACK TO SAVEPOINT intento')


with psycopg.connect(URL) as con:
    cur = con.cursor()
    cur.execute("SELECT count(*) FROM servicio WHERE del_local")
    check(cur.fetchone()[0] == 13, 'están los 13 servicios del local')
    cur.execute("SELECT count(*) FROM horario_local")
    check(cur.fetchone()[0] == 10, 'está el horario del local (10 tramos)')

    # --- Barberos
    cur.execute("INSERT INTO barbero (nombre) VALUES ('Barbero de prueba') RETURNING id")
    b2 = cur.fetchone()[0]
    rechaza(cur, "INSERT INTO barbero (nombre) VALUES ('barbero de PRUEBA')", None, 'no puede haber dos barberos activos con el mismo nombre')
    cur.execute("INSERT INTO horario_barbero VALUES (%s, 6, '08:00', '12:00')", (b2,))
    rechaza(cur, "INSERT INTO horario_barbero VALUES (%s, 5, '12:00', '08:00')", (b2,), 'la hora de salida tiene que ser después de la de entrada')

    # --- Clientes: papá e hijo con el mismo número; el mismo cliente no se repite
    cur.execute("INSERT INTO cliente (nombre, nombre_normalizado, telefono) VALUES ('Óscar Duarte', 'oscar duarte', '595981000111') RETURNING id")
    papa = cur.fetchone()[0]
    cur.execute("INSERT INTO cliente (nombre, nombre_normalizado, telefono) VALUES ('Thiago Duarte', 'thiago duarte', '595981000111') RETURNING id")
    hijo = cur.fetchone()[0]
    check(papa != hijo, 'un papá y su hijo con el mismo número son dos clientes')
    rechaza(cur, "INSERT INTO cliente (nombre, nombre_normalizado, telefono) VALUES ('OSCAR DUARTE', 'oscar duarte', '595981000111')", None,
            'el mismo número con el mismo nombre no se duplica')
    cur.execute("INSERT INTO cliente (nombre, nombre_normalizado) VALUES ('Pedro Gómez', 'pedro gomez')")
    rechaza(cur, "INSERT INTO cliente (nombre, nombre_normalizado) VALUES ('Pedro Gomez', 'pedro gomez')", None,
            'sin número, el mismo nombre tampoco se duplica')
    rechaza(cur, "INSERT INTO cliente (nombre, nombre_normalizado, telefono) VALUES ('X', 'x', '0981123456')", None,
            'el número se guarda en formato WhatsApp (595…)')
    # Cambio de número: el anterior queda guardado
    cur.execute("INSERT INTO cliente_telefono_anterior (cliente_id, telefono) VALUES (%s, '595981000111')", (papa,))
    cur.execute("UPDATE cliente SET telefono = '595994000512' WHERE id = %s", (papa,))
    cur.execute("SELECT c.nombre FROM cliente c JOIN cliente_telefono_anterior a ON a.cliente_id = c.id WHERE a.telefono = '595981000111'")
    check(cur.fetchone()[0] == 'Óscar Duarte', 'una reserva con el número anterior se reconoce')
    rechaza(cur, "INSERT INTO clientes_distintos VALUES (%s, %s)", (hijo, papa) if hijo > papa else (papa, hijo), 'los pares «son distintos» se guardan en orden (el menor primero)')
    cur.execute("INSERT INTO clientes_distintos (cliente_a, cliente_b) VALUES (%s, %s)", (min(papa, hijo), max(papa, hijo)))

    # --- Turnos
    turno = ("INSERT INTO turno (codigo, cliente_id, nombre_cliente, telefono, barbero_id, servicio_id, fecha, hora, duracion_min, precio) "
             "VALUES (%s, %s, %s, %s, %s, 'corte', '2030-01-05', %s, 30, 35000) RETURNING id")
    cur.execute(turno, ('TB-0001', hijo, 'Thiago Duarte', '595981000111', 1, '10:00'))
    t1 = cur.fetchone()[0]
    rechaza(cur, turno, ('TB-0002', papa, 'Óscar Duarte', '595994000512', 1, '10:00'), 'dos turnos del mismo barbero a la misma hora: entra solo el primero')
    cur.execute(turno, ('TB-0003', papa, 'Óscar Duarte', '595994000512', b2, '10:00'))
    check(True, 'a la misma hora, con otro barbero, sí entra')
    cur.execute(turno, ('TB-0004', None, 'Cliente sin turno', None, 1, '10:30'))
    t4 = cur.fetchone()[0]
    rechaza(cur, turno, ('TB-0001', hijo, 'Thiago Duarte', '595981000111', 1, '11:00'), 'el código del turno no se repite')

    # «Pasar después»: intercambiar las horas de dos turnos en una transacción
    cur.execute('SAVEPOINT intercambio')
    cur.execute('SET CONSTRAINTS un_turno_por_hora DEFERRED')
    cur.execute("UPDATE turno SET hora = '10:30', pospuesto = true WHERE id = %s", (t1,))
    cur.execute("UPDATE turno SET hora = '10:00' WHERE id = %s", (t4,))
    cur.execute('SET CONSTRAINTS un_turno_por_hora IMMEDIATE')
    cur.execute("SELECT hora::text FROM turno WHERE id IN (%s, %s) ORDER BY id", (t1, t4))
    check([r[0] for r in cur.fetchall()] == ['10:30:00', '10:00:00'], 'se pueden intercambiar las horas de dos turnos')
    cur.execute('RELEASE SAVEPOINT intercambio')

    # Cobrar, no vino, cancelar
    rechaza(cur, "UPDATE turno SET estado = 'atendido' WHERE id = %s", (t1,), 'un turno cobrado tiene que tener medio de pago')
    cur.execute("UPDATE turno SET estado = 'atendido', medio_pago = 'Efectivo' WHERE id = %s", (t1,))
    cur.execute("INSERT INTO movimiento_caja (tipo, categoria, concepto, monto, medio_pago, turno_id, barbero_id) VALUES ('entrada', 'servicio', 'Corte, Thiago Duarte', 35000, 'Efectivo', %s, 1)", (t1,))
    rechaza(cur, "INSERT INTO movimiento_caja (tipo, categoria, concepto, monto, medio_pago, turno_id) VALUES ('entrada', 'servicio', 'Otra vez', 35000, 'Efectivo', %s)", (t1,),
            'un turno no se cobra dos veces')
    rechaza(cur, "INSERT INTO movimiento_caja (tipo, categoria, concepto, monto, medio_pago) VALUES ('salida', 'servicio', 'X', 100, 'Efectivo')", None,
            'una salida de caja no puede ser de un servicio')
    rechaza(cur, "UPDATE turno SET estado = 'cancelado' WHERE id = %s", (t4,), 'un turno cancelado dice quién lo canceló')
    cur.execute("UPDATE turno SET estado = 'cancelado', cancelado_por = 'barberia', cancelado_en = now() WHERE id = %s", (t4,))
    cur.execute(turno, ('TB-0005', None, 'Otro cliente', None, 1, '10:00'))
    check(True, 'en la hora de un turno cancelado se puede dar otro')
    rechaza(cur, "UPDATE turno SET falso = true WHERE codigo = 'TB-0003'", None, 'solo un turno cancelado puede marcarse como falso')

    # --- Turnos falsos: números bloqueados y tope por número
    cur.execute("INSERT INTO numero_bloqueado (telefono, motivo) VALUES ('595981000111', 'Turno falso')")
    cur.execute("SELECT bloqueado FROM vista_clientes WHERE id = %s", (hijo,))
    check(cur.fetchone()[0] is True, 'la ficha muestra que el número está bloqueado')
    cur.execute("INSERT INTO turno (codigo, nombre_cliente, telefono, barbero_id, servicio_id, fecha, hora, duracion_min, precio) "
                "VALUES ('TB-0006', 'Ana Rojas', '595985111222', 1, 'corte', '2030-01-06', '09:00', 30, 35000), "
                "('TB-0007', 'Bea Rojas', '595985111222', 1, 'corte', '2030-01-06', '09:30', 30, 35000)")
    cur.execute("SELECT pendientes FROM vista_pendientes_por_numero WHERE telefono = '595985111222'")
    check(cur.fetchone()[0] == 2, 'la vista cuenta los turnos pendientes de cada número (para el tope de 4)')

    # --- Servicios, stock y fotos
    rechaza(cur, "INSERT INTO servicio (id, grupo, nombre, precio, duracion_min) VALUES ('n1', 'combo', 'Combo 7', 70000, 60)", None,
            'un combo tiene que decir qué incluye')
    rechaza(cur, "INSERT INTO servicio (id, grupo, nombre, precio, duracion_min) VALUES ('n1', 'servicio', 'CORTE CLÁSICO Y DEGRADADO', 30000, 30)", None,
            'no puede haber dos servicios con el mismo nombre')
    cur.execute("INSERT INTO servicio (id, grupo, nombre, precio, duracion_min) VALUES ('n1', 'servicio', 'Corte para niños', 25000, 30)")
    rechaza(cur, "INSERT INTO producto (tipo, nombre, unidad, unidad_plural, stock) VALUES ('venta', 'Cera', 'pote', 'potes', -1)", None,
            'el stock no puede quedar negativo')
    rechaza(cur, "INSERT INTO foto (lugar, archivo_original) VALUES ('logo', 'img/logo.jpg')", None,
            'solo las fotos de la galería pueden ser una de las originales')
    cur.execute("INSERT INTO foto (lugar, archivo, tipo_mime, ancho, alto) VALUES ('logo', '\\x00', 'image/webp', 512, 512)")
    rechaza(cur, "INSERT INTO foto (lugar, archivo, tipo_mime) VALUES ('logo', '\\x00', 'image/webp')", None, 'hay un solo logo')
    cur.execute("INSERT INTO foto (lugar, orden, archivo_original, descripcion) VALUES ('galeria', 1, 'img/galeria/corte-1.jpg', 'Degradado bajo'), ('galeria', 2, 'img/galeria/corte-2.jpg', 'Mullet')")
    check(True, 'la galería puede mezclar fotos originales y nuevas')

    # --- Cambio de horario solo para un barbero
    cur.execute("INSERT INTO cambio_horario (tipo, fecha_desde, fecha_hasta, motivo, barbero_id) VALUES ('cerrado', '2030-01-05', '2030-01-05', 'Trámite', %s)", (b2,))
    rechaza(cur, "INSERT INTO cambio_horario (tipo, fecha_desde, fecha_hasta, hora_desde, hora_hasta, barbero_id) VALUES ('especial', '2030-01-07', '2030-01-07', '09:00', '13:00', %s)", (b2,),
            '«otro horario» es para todo el local, no para un barbero')

    con.rollback()

print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')
