begin;

with source(category, type, verb, translation, example_base, usage) as (
    values
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Stand up', 'Ponerse de pie / Dejar plantado', 'Please stand up when she arrives. (ES: Por favor, ponte de pie cuando ella llegue.)', 'Related: Rise / Get up
Context: Contexto diferente: "Stand up" = ponerse de pie (acción física) o dejar plantado a alguien (figurado). "Rise" = más formal/solemne. "Get up" = levantarse de la cama. NO siempre intercambiables.
Examples:
1. Please stand up when she arrives. | ES: Por favor, ponte de pie cuando ella llegue.
2. He stood up to defend his friend. | ES: Se puso de pie para defender a su amigo.
3. She stood me up twice. (⚠️ "me" va después: stood up me ❌) | ES: Ella me dejó plantado dos veces.
4. The class stood up for the anthem. | ES: La clase se puso de pie para el himno.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get up', 'Levantarse (cama/suelo/silla)', 'I get up at 5 AM. (ES: Me levanto a las 5 de la mañana.)', 'Related: Rise / Stand up
Context: Contexto diferente: "Get up" = salir de la cama (rutina). "Rise" = formal/solemne. "Stand up" = ponerse de pie desde sentado. NO siempre intercambiables.
Examples:
1. I get up at 5 AM. | ES: Me levanto a las 5 de la mañana.
2. The old man fell but got up quickly. | ES: El anciano se cayó, pero se levantó rápidamente.
3. We got up late. | ES: Nos levantamos tarde.
4. She got up from the table. | ES: Ella se levantó de la mesa.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Wake up', 'Despertarse / Despertar a alguien', 'I wake up at 7 AM. (ES: Me despierto a las 7 de la mañana.)', 'Related: Awaken / Get up
Context: Contexto diferente: "Wake up" = abrir los ojos (dejar de dormir). "Get up" = salir de la cama. "Awaken" = formal/literario. NO intercambiables con Get up.
Examples:
1. I wake up at 7 AM. | ES: Me despierto a las 7 de la mañana.
2. Please wake me up at 6:30. (⚠️ "me" en medio: wake up me ❌) | ES: Por favor, despiértame a las 6:30.
3. The baby woke up crying. | ES: El bebé se despertó llorando.
4. He needs to wake up to the truth. | ES: Necesita despertar a la realidad.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Sit down', 'Sentarse', 'Please sit down and relax. (ES: Por favor, siéntate y relájate.)', 'Related: Take a seat
Context: Contexto diferente: "Sit down" = acción física común. "Take a seat" = más formal/cortés. Intercambiables en contexto formal, pero "sit down" es más común.
Examples:
1. Please sit down and relax. | ES: Por favor, siéntate y relájate.
2. She sat down on the sofa. | ES: Ella se sentó en el sofá.
3. We sat down to eat dinner. | ES: Nos sentamos a cenar.
4. The students sat down in their seats. | ES: Los estudiantes se sentaron en sus asientos.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Lie down', 'Acostarse / Tumbarse', 'I need to lie down for a while. (ES: Necesito acostarme un rato.)', 'Related: Rest / Recline
Context: Contexto diferente: "Lie down" = acción física de acostarse. "Rest" = descansar (más general). "Recline" = formal (reclinarse). NO siempre intercambiables.
Examples:
1. I need to lie down for a while. | ES: Necesito acostarme un rato.
2. She lay down on the bed. | ES: Ella se acostó en la cama.
3. The doctor told me to lie down. | ES: El médico me dijo que me acostara.
4. He lay down under the tree. | ES: Él se acostó debajo del árbol.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Stand out', 'Destacar / Sobresalir', 'Her red dress stands out. (ES: Su vestido rojo destaca.)', 'Related: Stick out
Context: Contexto diferente: "Stand out" = destacar positivamente. "Stick out" = sobresalir físicamente o ser notorio (a veces negativo). Intercambiables en algunos contextos, pero "stand out" es más positivo.
Examples:
1. Her red dress stands out. | ES: Su vestido rojo destaca.
2. He stands out because of his height. | ES: Él destaca por su estatura.
3. This product stands out. | ES: Este producto destaca.
4. Your work really stands out. | ES: Tu trabajo realmente destaca.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get in', 'Entrar (vehículo/casa)', 'Get in the car. (ES: Sube al coche.)', 'Related: Enter
Context: Contexto diferente: "Get in" = entrar a un vehículo pequeño (carro) o casa (informal). "Enter" = formal/neutral. Intercambiables pero "get in" es informal.
Examples:
1. Get in the car. | ES: Sube al coche.
2. She got in through the window. | ES: Ella entró por la ventana.
3. He got in trouble. | ES: Se metió en problemas.
4. The cat got in the house. | ES: El gato entró en la casa.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get out', 'Salir / Marcharse', 'Get out of my room! (ES: ¡Sal de mi habitación!)', 'Related: Exit / Leave
Context: Contexto diferente: "Get out" = salir (más enfático/urgente). "Exit" = formal. "Leave" = neutral. Intercambiables pero "get out" es más enfático.
Examples:
1. Get out of my room! | ES: ¡Sal de mi habitación!
2. She got out of the taxi. | ES: Ella salió del taxi.
3. We need to get out of this mess. | ES: Tenemos que salir de este lío.
4. The news got out to the press. | ES: La noticia llegó a la prensa.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Come back', 'Volver / Regresar', 'Please come back home early. (ES: Por favor, vuelve temprano a casa.)', 'Related: Return
Context: Contexto diferente: "Come back" = volver hacia el hablante (informal). "Return" = formal/neutral. Intercambiables pero "return" es formal.
Examples:
1. Please come back home early. | ES: Por favor, vuelve temprano a casa.
2. He came back from London. | ES: Él volvió de Londres.
3. The memories came back. | ES: Los recuerdos volvieron.
4. I''ll come back in 10 minutes. | ES: Volveré en 10 minutos.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Go back', 'Regresar (al lugar de origen)', 'Let''s go back to the hotel. (ES: Volvamos al hotel.)', 'Related: Return
Context: Contexto diferente: "Go back" = regresar a otro lugar (no donde está el hablante). "Come back" = hacia el hablante. "Return" = formal. NO intercambiables con "come back".
Examples:
1. Let''s go back to the hotel. | ES: Volvamos al hotel.
2. I want to go back to my country. | ES: Quiero volver a mi país.
3. She went back to sleep. | ES: Ella volvió a dormirse.
4. We go back a long way. | ES: Nos conocemos desde hace mucho tiempo.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get out of', 'Salir de / Librarse de', 'Get out of the car. (ES: Sal del coche.)', 'Related: Exit / Escape / Avoid
Context: Contexto diferente: "Get out of" = salir físicamente o librarse de una obligación (figurado). "Exit" = formal. "Escape" = escapar. "Avoid" = evitar. NO siempre intercambiables.
Examples:
1. Get out of the car. | ES: Sal del coche.
2. He got out of doing the dishes. | ES: Se libró de lavar los platos.
3. She got out of the meeting. | ES: Ella se libró de asistir a la reunión.
4. I need to get out of this situation. | ES: Necesito salir de esta situación.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get away', 'Escaparse / Irse', 'The thief got away. (ES: El ladrón escapó.)', 'Related: Escape / Leave
Context: Contexto diferente: "Get away" = escaparse (informal) o irse de vacaciones. "Escape" = escapar (más dramático). "Leave" = irse (neutral). NO siempre intercambiables.
Examples:
1. The thief got away. | ES: El ladrón escapó.
2. Let''s get away for the weekend. | ES: Escapémonos el fin de semana.
3. She got away from the crowd. | ES: Ella se alejó de la multitud.
4. He got away with it. | ES: Se salió con la suya.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Run away', 'Huir', 'The dog ran away. (ES: El perro huyó.)', 'Related: Flee / Escape
Context: Contexto diferente: "Run away" = huir corriendo (informal). "Flee" = formal/literario. "Escape" = escapar. Intercambiables pero "run away" es más común en habla.
Examples:
1. The dog ran away. | ES: El perro huyó.
2. She ran away from home. | ES: Ella se escapó de casa.
3. Don''t run away from your problems. | ES: No huyas de tus problemas.
4. The thief ran away. | ES: El ladrón huyó.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get on', 'Subir (transporte)', 'Get on the bus. (ES: Sube al autobús.)', 'Related: Board
Context: Contexto diferente: "Get on" = subir a transporte grande (bus, tren, avión). "Board" = formal. Intercambiables pero "board" es formal.
Examples:
1. Get on the bus. | ES: Sube al autobús.
2. She got on the train. | ES: Ella subió al tren.
3. Get on the bike. | ES: Sube a la bicicleta.
4. He got on the plane. | ES: Él subió al avión.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get off', 'Bajar (transporte)', 'Get off at the next stop. (ES: Bájate en la próxima parada.)', 'Related: Disembark
Context: Contexto diferente: "Get off" = bajar de transporte (informal). "Disembark" = formal (barcos/aviones). Intercambiables pero "disembark" es formal.
Examples:
1. Get off at the next stop. | ES: Bájate en la próxima parada.
2. She got off the bus. | ES: Ella bajó del autobús.
3. Get off the train. | ES: Bájate del tren.
4. He got off the plane. | ES: Él bajó del avión.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Come in', 'Entrar', 'Come in and sit down. (ES: Entra y siéntate.)', 'Related: Enter
Context: Contexto diferente: "Come in" = entrar (invitación, informal). "Enter" = formal. Intercambiables pero "come in" es más común.
Examples:
1. Come in and sit down. | ES: Entra y siéntate.
2. She came in through the back door. | ES: Ella entró por la puerta trasera.
3. Come in, the door is open. | ES: Pasa, la puerta está abierta.
4. He came in late. | ES: Él llegó tarde.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Go out', 'Salir (casa/fiesta) / Apagarse', 'Do you want to go out tonight? (ES: ¿Quieres salir esta noche?)', 'Related: Leave / Date / Extinguish
Context: Contexto diferente: "Go out" = salir de fiesta o tener una relación. "Leave" = irse. "Date" = salir con alguien. "Extinguish" = apagarse (luces/fuego). NO siempre intercambiables.
Examples:
1. Do you want to go out tonight? | ES: ¿Quieres salir esta noche?
2. We''re going out for dinner. | ES: Vamos a cenar fuera.
3. The lights went out. | ES: Se apagaron las luces.
4. They''ve been going out for a year. | ES: Llevan un año saliendo.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Take off', 'Quitarse (ropa) / Despegar (avión)', 'Take off your hat. / Take your hat off. / Take it off. (⚠️ "it" en medio) (ES: Quítate el sombrero.)', 'Related: Remove / Depart
Context: Contexto diferente: "Take off" = quitarse ropa (acción) o avión despega. "Remove" = quitar (formal). "Depart" = partir (formal). Intercambiables en contexto de ropa, pero "take off" es más común.
Examples:
1. Take off your hat. / Take your hat off. / Take it off. (⚠️ "it" en medio) | ES: Quítate el sombrero.
2. She took off her shoes. / She took her shoes off. / She took them off. | ES: Ella se quitó los zapatos.
3. The plane took off on time. (no separable: avión) | ES: El avión despegó a tiempo.
4. The business took off quickly. | ES: El negocio despegó rápidamente.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Put on', 'Ponerse (ropa/maquillaje)', 'Put on your jacket. / Put your jacket on. / Put it on. (⚠️ "it" en medio) (ES: Ponte la chaqueta.)', 'Related: Wear / Dress
Context: Contexto diferente: "Put on" = acción de ponerse ropa. "Wear" = estado de tener ropa puesta. NO intercambiables.
Examples:
1. Put on your jacket. / Put your jacket on. / Put it on. (⚠️ "it" en medio) | ES: Ponte la chaqueta.
2. She put on her makeup. / She put her makeup on. / She put it on. | ES: Ella se maquilló.
3. He put on some music. / He put some music on. / He put it on. | ES: Él puso música.
4. I put on my glasses. / I put my glasses on. / I put them on. | ES: Me puse las gafas.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Inseparable', 'Get around', 'Moverse / Circular', 'I get around by bike. (ES: Me desplazo en bicicleta.)', 'Related: Move / Travel
Context: Contexto diferente: "Get around" = moverse por la ciudad o evitar un problema. "Move" = moverse (general). "Travel" = viajar. NO siempre intercambiables.
Examples:
1. I get around by bike. | ES: Me desplazo en bicicleta.
2. She gets around the city easily. | ES: Ella se mueve por la ciudad con facilidad.
3. He gets around a lot. | ES: Él viaja mucho.
4. Get around the traffic. | ES: Rodea el tráfico.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Take away', 'Quitar / Llevar / Sustraer', 'Take away his toys. / Take his toys away. / Take them away. (⚠️ "them" en medio) (ES: Quita sus juguetes.)', 'Related: Remove / Subtract
Context: Contexto diferente: "Take away" = quitar físicamente o restar (matemáticas). "Remove" = quitar (formal). "Subtract" = restar (matemáticas). Intercambiables en contexto físico, pero "take away" es más común.
Examples:
1. Take away his toys. / Take his toys away. / Take them away. (⚠️ "them" en medio) | ES: Quita sus juguetes.
2. The waiter took away our plates. / The waiter took our plates away. / The waiter took them away. | ES: El camarero retiró nuestros platos.
3. Take away 5 from 10. (no separable: matemáticas) | ES: Resta 5 a 10.
4. The pain took away my appetite. / The pain took my appetite away. / The pain took it away. | ES: El dolor me quitó el apetito.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Throw away', 'Tirar / Desechar', 'Throw away the trash. / Throw the trash away. / Throw it away. (⚠️ "it" en medio) (ES: Tira la basura.)', 'Related: Discard / Dispose of
Context: Contexto diferente: "Throw away" = tirar a la basura (informal). "Discard" = descartar (formal). "Dispose of" = deshacerse de (formal). Intercambiables pero "throw away" es más común.
Examples:
1. Throw away the trash. / Throw the trash away. / Throw it away. (⚠️ "it" en medio) | ES: Tira la basura.
2. Don''t throw away your old clothes. / Don''t throw your old clothes away. / Don''t throw them away. | ES: No tires tu ropa vieja.
3. She threw away the receipt. / She threw the receipt away. / She threw it away. | ES: Ella tiró el recibo.
4. He threw away his chance. / He threw his chance away. / He threw it away. | ES: Él desperdició su oportunidad.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Take out', 'Sacar / Extraer / Invitar a salir', 'Take out the garbage. / Take the garbage out. / Take it out. (⚠️ "it" en medio) (ES: Saca la basura.)', 'Related: Remove / Extract / Invite
Context: Contexto diferente: "Take out" = sacar algo de un lugar, extraer, o invitar a alguien a salir. "Remove" = quitar (formal). "Extract" = extraer (formal). "Invite" = invitar (general). NO siempre intercambiables.
Examples:
1. Take out the garbage. / Take the garbage out. / Take it out. (⚠️ "it" en medio) | ES: Saca la basura.
2. She took out her wallet. / She took her wallet out. / She took it out. | ES: Ella sacó su cartera.
3. He took me out for dinner. (⚠️ "me" en medio: took out me ❌) | ES: Él me llevó a cenar.
4. The dentist took out my tooth. / The dentist took my tooth out. / The dentist took it out. | ES: El dentista me sacó un diente.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Put away', 'Guardar / Ordenar / Ahorrar', 'Put away your toys. / Put your toys away. / Put them away. (⚠️ "them" en medio) (ES: Guarda tus juguetes.)', 'Related: Store / Save
Context: Contexto diferente: "Put away" = guardar cosas en su lugar, o ahorrar dinero (informal). "Store" = almacenar (formal). "Save" = ahorrar (general). Intercambiables en contexto de guardar, pero "put away" es más común.
Examples:
1. Put away your toys. / Put your toys away. / Put them away. (⚠️ "them" en medio) | ES: Guarda tus juguetes.
2. She put away the dishes. / She put the dishes away. / She put them away. | ES: Ella guardó los platos.
3. He put away some money for retirement. / He put some money away. / He put it away. | ES: Él ahorró algo de dinero para la jubilación.
4. Put away the groceries. / Put the groceries away. / Put them away. | ES: Guarda las compras.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Put down', 'Poner (en el suelo) / Menospreciar / Sacrificar', 'Put down the box. / Put the box down. / Put it down. (⚠️ "it" en medio) (ES: Pon la caja en el suelo.)', 'Related: Place / Insult / Euthanize
Context: Contexto diferente: "Put down" = poner algo en el suelo, menospreciar a alguien, o sacrificar un animal. "Place" = colocar (formal). "Insult" = insultar. NO intercambiables.
Examples:
1. Put down the box. / Put the box down. / Put it down. (⚠️ "it" en medio) | ES: Pon la caja en el suelo.
2. She put down her bags. / She put her bags down. / She put them down. | ES: Ella dejó sus bolsas en el suelo.
3. Don''t put me down! (⚠️ "me" en medio: put down me ❌) | ES: ¡No me menosprecies!
4. They had to put down the dog. / They had to put the dog down. / They had to put it down. | ES: Tuvieron que sacrificar al perro.'),
    ('Phrasal Verbs - Movimiento Y Acción Física', 'Separable', 'Turn over', 'Voltear / Dar la vuelta / Entregar', 'Turn over the page. / Turn the page over. / Turn it over. (⚠️ "it" en medio) (ES: Dale la vuelta a la página.)', 'Related: Flip / Hand over
Context: Contexto diferente: "Turn over" = voltear algo o entregar algo a alguien. "Flip" = voltear (informal). "Hand over" = entregar (formal). Intercambiables en algunos contextos.
Examples:
1. Turn over the page. / Turn the page over. / Turn it over. (⚠️ "it" en medio) | ES: Dale la vuelta a la página.
2. She turned over the mattress. / She turned the mattress over. / She turned it over. | ES: Ella volteó el colchón.
3. He turned over the money to the police. / He turned the money over. / He turned it over. | ES: Él entregó el dinero a la policía.
4. The car turned over. (no separable: volcarse) | ES: El coche volcó.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look for', 'Buscar (proceso)', 'I''m looking for my wallet. (⚠️ "it": looking for it ✅ / looking it for ❌) (ES: Estoy buscando mi cartera.)', 'Related: Search for / Seek
Context: Contexto diferente: "Look for" = buscar (proceso, informal). "Search for" = buscar (más intenso/formal). "Seek" = buscar (formal/abstracto). Intercambiables pero "look for" es más común.
Examples:
1. I''m looking for my wallet. (⚠️ "it": looking for it ✅ / looking it for ❌) | ES: Estoy buscando mi cartera.
2. She''s looking for a new job. | ES: Ella está buscando un nuevo trabajo.
3. The police are looking for clues. | ES: La policía está buscando pistas.
4. We''re looking for a good restaurant. | ES: Estamos buscando un buen restaurante.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Separable', 'Find out', 'Descubrir / Averiguar', 'I need to find out the truth. / I need to find the truth out. / I need to find it out. (⚠️ "it" en medio) (ES: Necesito averiguar la verdad.)', 'Related: Discover / Figure out
Context: Contexto diferente: "Find out" = descubrir un hecho (resultado). "Discover" = descubrir (más científico/formal). "Figure out" = resolver/entender. NO intercambiables con "figure out".
Examples:
1. I need to find out the truth. / I need to find the truth out. / I need to find it out. (⚠️ "it" en medio) | ES: Necesito averiguar la verdad.
2. She found out she was pregnant. (no separable: cláusula) | ES: Ella descubrió que estaba embarazada.
3. How did you find out my secret? / How did you find my secret out? / How did you find it out? | ES: ¿Cómo descubriste mi secreto?
4. The detective found out who did it. | ES: El detective averiguó quién lo hizo.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Separable', 'Look up', 'Buscar (diccionario/internet) / Mirar arriba', 'Look up this word. / Look this word up. / Look it up. (⚠️ "it" en medio) (ES: Busca esta palabra.)', 'Related: Search (online)
Context: Contexto diferente: "Look up" = buscar información (diccionario/internet) o mirar hacia arriba. "Search" = buscar (general). NO siempre intercambiables.
Examples:
1. Look up this word. / Look this word up. / Look it up. (⚠️ "it" en medio) | ES: Busca esta palabra.
2. I looked up the flight schedule. / I looked the flight schedule up. / I looked it up. | ES: Busqué el horario de vuelos.
3. She looked up at the stars. (no separable: mirar arriba) | ES: Ella miró hacia las estrellas.
4. Things are looking up. (figurado, no separable) | ES: Las cosas están mejorando.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look after', 'Cuidar / Vigilar', 'Can you look after my dog? (⚠️ "him": look after him ✅ / look him after ❌) (ES: ¿Puedes cuidar a mi perro?)', 'Related: Take care of
Context: Contexto diferente: "Look after" = cuidar (UK, informal). "Take care of" = cuidar (US, más común). Intercambiables 100%.
Examples:
1. Can you look after my dog? (⚠️ "him": look after him ✅ / look him after ❌) | ES: ¿Puedes cuidar a mi perro?
2. She looks after her mother. | ES: Ella cuida de su madre.
3. He looked after my bag. | ES: Él cuidó mi bolso.
4. Who will look after the children? | ES: ¿Quién cuidará a los niños?'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look into', 'Investigar / Examinar', 'The police are looking into the case. (⚠️ "it": looking into it ✅ / looking it into ❌) (ES: La policía está investigando el caso.)', 'Related: Investigate / Examine
Context: Contexto diferente: "Look into" = investigar (informal). "Investigate" = investigar (formal). "Examine" = examinar (formal). Intercambiables pero "look into" es más coloquial.
Examples:
1. The police are looking into the case. (⚠️ "it": looking into it ✅ / looking it into ❌) | ES: La policía está investigando el caso.
2. I''ll look into the problem. | ES: Investigaré el problema.
3. We need to look into new opportunities. | ES: Tenemos que explorar nuevas oportunidades.
4. The committee is looking into the complaint. | ES: El comité está investigando la queja.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look out', 'Tener cuidado', 'Look out! There''s a car! (ES: ¡Cuidado! ¡Hay un coche!)', 'Related: Watch out / Beware
Context: Contexto diferente: "Look out" = tener cuidado (informal). "Watch out" = tener cuidado (más urgente). "Beware" = tener cuidado (formal). Intercambiables pero "watch out" es más urgente.
Examples:
1. Look out! There''s a car! | ES: ¡Cuidado! ¡Hay un coche!
2. You need to look out for pickpockets. | ES: Debes tener cuidado con los carteristas.
3. Look out for your little brother. | ES: Cuida a tu hermano pequeño.
4. She always looks out for her friends. | ES: Ella siempre vela por sus amigos.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Separable', 'Figure out', 'Resolver / Entender', 'I can''t figure out this math problem. / I can''t figure this math problem out. / I can''t figure it out. (⚠️ "it" en medio) (ES: No puedo resolver este problema de matemáticas.)', 'Related: Understand / Solve
Context: Contexto diferente: "Figure out" = resolver/entender (informal). "Understand" = entender (general). "Solve" = resolver (formal). NO intercambiables con "find out".
Examples:
1. I can''t figure out this math problem. / I can''t figure this math problem out. / I can''t figure it out. (⚠️ "it" en medio) | ES: No puedo resolver este problema de matemáticas.
2. She figured out how to use the app. (cláusula, no separable) | ES: Ella descubrió cómo usar la aplicación.
3. We need to figure out a solution. / We need to figure a solution out. / We need to figure it out. | ES: Tenemos que encontrar una solución.
4. He finally figured out she was lying. | ES: Por fin se dio cuenta de que ella estaba mintiendo.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Come across', 'Encontrar por casualidad / Parecer', 'I came across an old friend. (⚠️ "him": came across him ✅ / came him across ❌) (ES: Me encontré con un viejo amigo.)', 'Related: Encounter / Seem
Context: Contexto diferente: "Come across" = encontrar por casualidad o dar una impresión. "Encounter" = encontrar (formal). "Seem" = parecer. NO siempre intercambiables.
Examples:
1. I came across an old friend. (⚠️ "him": came across him ✅ / came him across ❌) | ES: Me encontré con un viejo amigo.
2. She came across a rare book. | ES: Ella encontró un libro poco común.
3. He comes across as arrogant. | ES: Él da la impresión de ser arrogante.
4. I came across this article online. | ES: Encontré este artículo en internet.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look forward to', 'Esperar con ilusión', 'I look forward to seeing you. (⚠️ "it": look forward to it ✅ / look it forward to ❌) (ES: Espero con ilusión verte.)', 'Related: Anticipate / Eagerly await
Context: Contexto diferente: "Look forward to" = esperar con emoción (informal). "Anticipate" = anticipar (formal). Intercambiables pero "look forward to" es más emocional.
Examples:
1. I look forward to seeing you. (⚠️ "it": look forward to it ✅ / look it forward to ❌) | ES: Espero con ilusión verte.
2. She looks forward to her birthday. | ES: Ella espera con ilusión su cumpleaños.
3. We look forward to the holidays. | ES: Esperamos con ilusión las vacaciones.
4. He looks forward to retiring. | ES: Él espera con ilusión jubilarse.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Separable', 'Look over', 'Revisar', 'Look over the contract. / Look the contract over. / Look it over. (⚠️ "it" en medio) (ES: Revisa el contrato.)', 'Related: Review / Examine
Context: Contexto diferente: "Look over" = revisar rápidamente (informal). "Review" = revisar (formal). "Examine" = examinar (formal). Intercambiables pero "look over" es más casual.
Examples:
1. Look over the contract. / Look the contract over. / Look it over. (⚠️ "it" en medio) | ES: Revisa el contrato.
2. She looked over the documents. / She looked the documents over. / She looked them over. | ES: Ella revisó los documentos.
3. Can you look over my essay? / Can you look my essay over? / Can you look it over? | ES: ¿Puedes revisar mi ensayo?
4. He looked over the report. / He looked the report over. / He looked it over. | ES: Él revisó el informe.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look up to', 'Admirar', 'I look up to my father. (⚠️ "him": look up to him ✅ / look him up to ❌) (ES: Admiro a mi padre.)', 'Related: Admire / Respect
Context: Contexto diferente: "Look up to" = admirar (informal). "Admire" = admirar (formal). "Respect" = respetar. Intercambiables pero "look up to" es más personal.
Examples:
1. I look up to my father. (⚠️ "him": look up to him ✅ / look him up to ❌) | ES: Admiro a mi padre.
2. She looks up to her mentor. | ES: Ella admira a su mentor.
3. He looks up to his older brother. | ES: Él admira a su hermano mayor.
4. We look up to great leaders. | ES: Admiramos a los grandes líderes.'),
    ('Phrasal Verbs - Búsqueda Y Descubrimiento', 'Inseparable', 'Look down on', 'Menospreciar', 'Don''t look down on others. (⚠️ "them": look down on them ✅ / look them down on ❌) (ES: No menosprecies a los demás.)', 'Related: Despise / Disdain
Context: Contexto diferente: "Look down on" = menospreciar (informal). "Despise" = despreciar (fuerte). "Disdain" = desdeñar (formal). Intercambiables pero "look down on" es más común.
Examples:
1. Don''t look down on others. (⚠️ "them": look down on them ✅ / look them down on ❌) | ES: No menosprecies a los demás.
2. She looks down on people who don''t work. | ES: Ella menosprecia a las personas que no trabajan.
3. He looks down on his neighbors. | ES: Él menosprecia a sus vecinos.
4. They look down on the poor. | ES: Ellos menosprecian a los pobres.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Call back', 'Devolver una llamada', 'I''ll call you back in 5 minutes. (⚠️ "you" en medio) / I''ll call back you ❌ (ES: Te devolveré la llamada en cinco minutos.)', 'Related: Return a call
Context: Contexto diferente: "Call back" = devolver llamada (informal). "Return a call" = formal. Intercambiables pero "call back" es más común.
Examples:
1. I''ll call you back in 5 minutes. (⚠️ "you" en medio) / I''ll call back you ❌ | ES: Te devolveré la llamada en cinco minutos.
2. She called back her client. / She called her client back. / She called him back. | ES: Ella volvió a llamar a su cliente.
3. Please call back later. (no separable: sin objeto) | ES: Por favor, vuelve a llamar más tarde.
4. He never called me back. (⚠️ "me" en medio) | ES: Él nunca me devolvió la llamada.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Call off', 'Cancelar', 'They called off the meeting. / They called the meeting off. / They called it off. (⚠️ "it" en medio) (ES: Cancelaron la reunión.)', 'Related: Cancel
Context: Contexto diferente: "Call off" = cancelar (informal). "Cancel" = cancelar (formal). Intercambiables 100%.
Examples:
1. They called off the meeting. / They called the meeting off. / They called it off. (⚠️ "it" en medio) | ES: Cancelaron la reunión.
2. The wedding was called off. (pasiva) | ES: La boda fue cancelada.
3. We called off the search. / We called the search off. / We called it off. | ES: Cancelamos la búsqueda.
4. She called off her engagement. / She called her engagement off. / She called it off. | ES: Ella canceló su compromiso.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Hang up', 'Colgar el teléfono', 'Don''t hang up! (ES: ¡No cuelgues!)', 'Related: End the call
Context: Contexto diferente: "Hang up" = colgar el teléfono (informal). "End the call" = formal. Intercambiables pero "hang up" es más común.
Examples:
1. Don''t hang up! | ES: ¡No cuelgues!
2. She hung up angrily. | ES: Ella colgó enojada.
3. He hung up on me. (⚠️ "me" va después: hung up on me ✅) | ES: Él me colgó.
4. I hung up and called again. | ES: Colgué y volví a llamar.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Talk into', 'Convencer', 'She talked me into buying the car. (⚠️ "me" en medio) / She talked into me ❌ (ES: Ella me convenció de comprar el coche.)', 'Related: Persuade / Convince
Context: Contexto diferente: "Talk into" = convencer (informal). "Persuade" = persuadir (formal). "Convince" = convencer (formal). Intercambiables pero "talk into" es más coloquial.
Examples:
1. She talked me into buying the car. (⚠️ "me" en medio) / She talked into me ❌ | ES: Ella me convenció de comprar el coche.
2. He talked her into going. / He talked into her ❌ | ES: Él la convenció de ir.
3. I can''t talk him into it. / I can''t talk into him ❌ | ES: No puedo convencerlo de eso.
4. They talked me into staying. / They talked into me ❌ | ES: Me convencieron de quedarme.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Talk out of', 'Disuadir', 'I talked him out of quitting. (⚠️ "him" en medio) / I talked out of him ❌ (ES: Lo convencí de que no renunciara.)', 'Related: Dissuade
Context: Contexto diferente: "Talk out of" = disuadir (informal). "Dissuade" = disuadir (formal). Intercambiables pero "talk out of" es más común.
Examples:
1. I talked him out of quitting. (⚠️ "him" en medio) / I talked out of him ❌ | ES: Lo convencí de que no renunciara.
2. She talked me out of buying it. / She talked out of me ❌ | ES: Ella me convenció de no comprarlo.
3. The parents talked their son out of dropping out. / The parents talked out of their son ❌ | ES: Los padres convencieron a su hijo de no abandonar los estudios.
4. Can you talk her out of that idea? / Can you talk out of her ❌ | ES: ¿Puedes convencerla de que abandone esa idea?'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Speak up', 'Hablar más fuerte / Dar opinión', 'Please speak up, I can''t hear you. (ES: Por favor, habla más fuerte; no te oigo.)', 'Related: Speak louder / Voice opinion
Context: Contexto diferente: "Speak up" = hablar más fuerte o dar opinión (informal). "Speak louder" = hablar más fuerte (literal). "Voice opinion" = dar opinión (formal). NO siempre intercambiables.
Examples:
1. Please speak up, I can''t hear you. | ES: Por favor, habla más fuerte; no te oigo.
2. If you don''t agree, speak up! | ES: Si no estás de acuerdo, dilo.
3. She spoke up against injustice. | ES: Ella alzó la voz contra la injusticia.
4. You should speak up in class. | ES: Deberías expresar tu opinión en clase.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Shut up', 'Callarse (¡grosero!)', 'Shut up! I''m trying to study. (ES: ¡Cállate! Estoy intentando estudiar.)', 'Related: Be quiet
Context: Contexto diferente: "Shut up" = callarse (grosero/informal). "Be quiet" = callarse (neutral/cortés). NO intercambiables en contexto formal.
Examples:
1. Shut up! I''m trying to study. | ES: ¡Cállate! Estoy intentando estudiar.
2. He told me to shut up. (⚠️ "me" va después: told me to shut up ✅) | ES: Me dijo que me callara.
3. Just shut up and listen. | ES: Simplemente cállate y escucha.
4. She never shuts up. | ES: Ella nunca se calla.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Point out', 'Señalar', 'She pointed out my mistake. / She pointed my mistake out. / She pointed it out. (⚠️ "it" en medio) (ES: Ella señaló mi error.)', 'Related: Indicate / Mention
Context: Contexto diferente: "Point out" = señalar (informal). "Indicate" = indicar (formal). "Mention" = mencionar (formal). Intercambiables pero "point out" es más común.
Examples:
1. She pointed out my mistake. / She pointed my mistake out. / She pointed it out. (⚠️ "it" en medio) | ES: Ella señaló mi error.
2. He pointed out the error. / He pointed the error out. / He pointed it out. | ES: Él señaló el error.
3. Can you point out the problem? / Can you point the problem out? / Can you point it out? | ES: ¿Puedes señalar el problema?
4. She pointed out the benefits. / She pointed the benefits out. / She pointed them out. | ES: Ella señaló los beneficios.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Bring up', 'Mencionar / Criar', 'Don''t bring up that topic. / Don''t bring that topic up. / Don''t bring it up. (⚠️ "it" en medio) (ES: No menciones ese tema.)', 'Related: Mention / Raise
Context: Contexto diferente: "Bring up" = mencionar (informal) o criar niños. "Mention" = mencionar (formal). "Raise" = criar (formal). NO siempre intercambiables.
Examples:
1. Don''t bring up that topic. / Don''t bring that topic up. / Don''t bring it up. (⚠️ "it" en medio) | ES: No menciones ese tema.
2. She brought up her children alone. / She brought her children up alone. / She brought them up alone. | ES: Ella crió sola a sus hijos.
3. He brought up the issue. / He brought the issue up. / He brought it up. | ES: Él mencionó el asunto.
4. They brought up the question. / They brought the question up. / They brought it up. | ES: Ellos plantearon la pregunta.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Talk about', 'Hablar de', 'We talked about the project. (⚠️ "it": talked about it ✅ / talked it about ❌) (ES: Hablamos del proyecto.)', 'Related: Discuss
Context: Contexto diferente: "Talk about" = hablar de (informal). "Discuss" = discutir (formal). Intercambiables pero "talk about" es más común.
Examples:
1. We talked about the project. (⚠️ "it": talked about it ✅ / talked it about ❌) | ES: Hablamos del proyecto.
2. She talked about her trip. | ES: Ella habló de su viaje.
3. They talked about the news. | ES: Ellos hablaron de las noticias.
4. Let''s talk about it. | ES: Hablemos de eso.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Get through', 'Comunicarse / Superar', 'I couldn''t get through. (ES: No pude comunicarme.)', 'Related: Connect / Survive
Context: Contexto diferente: "Get through" = comunicarse por teléfono o superar una situación difícil. "Connect" = conectar. "Survive" = sobrevivir. NO siempre intercambiables.
Examples:
1. I couldn''t get through. | ES: No pude comunicarme.
2. She got through the exam. | ES: Ella aprobó el examen.
3. We got through the crisis. | ES: Superamos la crisis.
4. Can you get through to him? | ES: ¿Puedes comunicarte con él?'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Put off', 'Posponer', 'Don''t put off your homework. / Don''t put your homework off. / Don''t put it off. (⚠️ "it" en medio) (ES: No pospongas tu tarea.)', 'Related: Postpone / Delay
Context: Contexto diferente: "Put off" = posponer (informal) o desanimar. "Postpone" = posponer (formal). "Delay" = retrasar. Intercambiables en contexto de posponer, pero "put off" también significa desanimar.
Examples:
1. Don''t put off your homework. / Don''t put your homework off. / Don''t put it off. (⚠️ "it" en medio) | ES: No pospongas tu tarea.
2. She put off the meeting. / She put the meeting off. / She put it off. | ES: Ella pospuso la reunión.
3. They put off the wedding. / They put the wedding off. / They put it off. | ES: Pospusieron la boda.
4. He put off his decision. / He put his decision off. / He put it off. | ES: Él pospuso su decisión.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Tell off', 'Regañar', 'She told him off. (⚠️ "him" en medio) / She told off him ❌ (ES: Ella lo reprendió.)', 'Related: Scold / Reprimand
Context: Contexto diferente: "Tell off" = regañar (informal). "Scold" = regañar (formal). "Reprimand" = reprender (formal). Intercambiables pero "tell off" es más común.
Examples:
1. She told him off. (⚠️ "him" en medio) / She told off him ❌ | ES: Ella lo reprendió.
2. The boss told him off. / The boss told off him ❌ | ES: El jefe lo reprendió.
3. My mom told me off. / My mom told off me ❌ | ES: Mi mamá me regañó.
4. He told off the driver. / He told the driver off. / He told him off. | ES: Él reprendió al conductor.'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Talk over', 'Discutir', 'Let''s talk it over. (⚠️ "it" en medio) / Let''s talk over it ❌ (ES: Hablemos de eso.)', 'Related: Discuss
Context: Contexto diferente: "Talk over" = discutir (informal). "Discuss" = discutir (formal). Intercambiables pero "talk over" es más casual.
Examples:
1. Let''s talk it over. (⚠️ "it" en medio) / Let''s talk over it ❌ | ES: Hablemos de eso.
2. We talked over the plan. / We talked the plan over. / We talked it over. | ES: Hablamos del plan.
3. They talked over the problem. / They talked the problem over. / They talked it over. | ES: Ellos hablaron del problema.
4. Can we talk it over? / Can we talk over it ❌ | ES: ¿Podemos hablarlo?'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Inseparable', 'Speak out', 'Pronunciarse', 'She spoke out against injustice. (ES: Ella se pronunció contra la injusticia.)', 'Related: Express / Protest
Context: Contexto diferente: "Speak out" = pronunciarse públicamente (informal). "Express" = expresar (formal). "Protest" = protestar. Intercambiables pero "speak out" es más activista.
Examples:
1. She spoke out against injustice. | ES: Ella se pronunció contra la injusticia.
2. He spoke out about the issue. | ES: Él se pronunció sobre el asunto.
3. They spoke out for their rights. | ES: Ellos defendieron sus derechos públicamente.
4. Speak out! | ES: ¡Exprésate!'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Write down', 'Anotar', 'Write down your name. / Write your name down. / Write it down. (⚠️ "it" en medio) (ES: Anota tu nombre.)', 'Related: Record / Note
Context: Contexto diferente: "Write down" = anotar (informal). "Record" = registrar (formal). "Note" = notar. Intercambiables pero "write down" es más común.
Examples:
1. Write down your name. / Write your name down. / Write it down. (⚠️ "it" en medio) | ES: Anota tu nombre.
2. She wrote down the address. / She wrote the address down. / She wrote it down. | ES: Ella anotó la dirección.
3. He wrote down the number. / He wrote the number down. / He wrote it down. | ES: Él anotó el número.
4. Write it down! / Write down it ❌ | ES: ¡Anótalo!'),
    ('Phrasal Verbs - Comunicación Y Habla', 'Separable', 'Make fun of', 'Burlarse de', 'Don''t make fun of him. (⚠️ "him" va después: make fun of him ✅ / make him fun of ❌) (ES: No te burles de él.)', 'Related: Mock / Tease / Ridicule
Context: Contexto diferente: "Make fun of" = burlarse (informal). "Mock" = burlarse (formal). "Tease" = molestar. "Ridicule" = ridiculizar (fuerte). Intercambiables pero "make fun of" es más común.
Note: NOTA: "Make fun of" es inseparable en la práctica porque "of" es preposición. El pronombre va después: make fun of him ✅.
Examples:
1. Don''t make fun of him. (⚠️ "him" va después: make fun of him ✅ / make him fun of ❌) | ES: No te burles de él.
2. They made fun of her accent. | ES: Se burlaron de su acento.
3. Stop making fun of me. | ES: Deja de burlarte de mí.
4. He made fun of the situation. | ES: Se burló de la situación.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Turn on', 'Encender (aparatos)', 'Turn on the TV. / Turn the TV on. / Turn it on. (⚠️ "it" en medio) / Turn on it ❌ (ES: Enciende el televisor.)', 'Related: Switch on / Activate
Context: Contexto diferente: "Turn on" = encender (informal) o excitar (figurado). "Switch on" = encender (UK, formal). "Activate" = activar (formal). Intercambiables en contexto de aparatos, pero "turn on" tiene sentido figurado.
Examples:
1. Turn on the TV. / Turn the TV on. / Turn it on. (⚠️ "it" en medio) / Turn on it ❌ | ES: Enciende el televisor.
2. She turned on the lights. / She turned the lights on. / She turned them on. | ES: Ella encendió las luces.
3. He turned on the computer. / He turned the computer on. / He turned it on. | ES: Él encendió la computadora.
4. The music turns me on. (⚠️ "me" en medio) | ES: La música me entusiasma.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Turn off', 'Apagar (aparatos)', 'Please turn off the lights. / Please turn the lights off. / Please turn them off. (⚠️ "them" en medio) (ES: Por favor, apaga las luces.)', 'Related: Switch off / Deactivate
Context: Contexto diferente: "Turn off" = apagar (informal) o desagradar (figurado). "Switch off" = apagar (UK). "Deactivate" = desactivar (formal). Intercambiables en contexto de aparatos, pero "turn off" tiene sentido figurado.
Examples:
1. Please turn off the lights. / Please turn the lights off. / Please turn them off. (⚠️ "them" en medio) | ES: Por favor, apaga las luces.
2. She turned off the engine. / She turned the engine off. / She turned it off. | ES: Ella apagó el motor.
3. He turned off his phone. / He turned his phone off. / He turned it off. | ES: Él apagó su teléfono.
4. That attitude turns me off. (⚠️ "me" en medio) | ES: Esa actitud me desagrada.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Turn up', 'Aparecer / Subir volumen', 'She turned up late. (no separable: aparecer) (ES: Ella llegó tarde.)', 'Related: Arrive / Increase volume
Context: Contexto diferente: "Turn up" = aparecer (informal) o subir volumen. "Arrive" = llegar (formal). "Increase" = aumentar (formal). NO siempre intercambiables.
Examples:
1. She turned up late. (no separable: aparecer) | ES: Ella llegó tarde.
2. Turn up the volume. / Turn the volume up. / Turn it up. (⚠️ "it" en medio) | ES: Sube el volumen.
3. 80 people turned up. (no separable: aparecer) | ES: Llegaron 80 personas.
4. Something always turns up. (figurado, no separable) | ES: Siempre surge algo.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Turn down', 'Rechazar / Bajar volumen', 'She turned down the job. / She turned the job down. / She turned it down. (⚠️ "it" en medio) (ES: Ella rechazó el trabajo.)', 'Related: Refuse / Reject / Lower volume
Context: Contexto diferente: "Turn down" = rechazar (informal) o bajar volumen. "Refuse" = rechazar (formal). "Reject" = rechazar (fuerte). "Lower" = bajar (formal). NO siempre intercambiables.
Examples:
1. She turned down the job. / She turned the job down. / She turned it down. (⚠️ "it" en medio) | ES: Ella rechazó el trabajo.
2. He turned down her invitation. / He turned her invitation down. / He turned it down. | ES: Él rechazó su invitación.
3. Please turn down the music. / Please turn the music down. / Please turn it down. | ES: Por favor, baja la música.
4. They turned down our proposal. / They turned our proposal down. / They turned it down. | ES: Rechazaron nuestra propuesta.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Pick up', 'Recoger / Levantar / Aprender', 'I''ll pick you up at 8 PM. (⚠️ "you" en medio) / I''ll pick up you ❌ (ES: Te recogeré a las 8 de la noche.)', 'Related: Collect / Lift / Learn
Context: Contexto diferente: "Pick up" = recoger (informal), levantar, o aprender sin esfuerzo. "Collect" = recoger (formal). "Lift" = levantar (formal). "Learn" = aprender (formal). NO siempre intercambiables.
Examples:
1. I''ll pick you up at 8 PM. (⚠️ "you" en medio) / I''ll pick up you ❌ | ES: Te recogeré a las 8 de la noche.
2. She picked up the pen. / She picked the pen up. / She picked it up. | ES: Ella recogió el bolígrafo.
3. He picked up Italian in 3 months. / He picked Italian up in 3 months. / He picked it up. | ES: Aprendió italiano en tres meses.
4. The economy is picking up. (figurado, no separable) | ES: La economía se está recuperando.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Drop off', 'Dejar (alguien) / Disminuir', 'Can you drop me off? (⚠️ "me" en medio) / Can you drop off me ❌ (ES: ¿Puedes dejarme allí?)', 'Related: Leave / Deliver / Decrease
Context: Contexto diferente: "Drop off" = dejar a alguien (informal) o disminuir. "Leave" = dejar (general). "Deliver" = entregar (formal). "Decrease" = disminuir (formal). NO siempre intercambiables.
Examples:
1. Can you drop me off? (⚠️ "me" en medio) / Can you drop off me ❌ | ES: ¿Puedes dejarme allí?
2. She dropped off the kids. / She dropped the kids off. / She dropped them off. | ES: Ella dejó a los niños.
3. I dropped off the package. / I dropped the package off. / I dropped it off. | ES: Dejé el paquete.
4. Sales have dropped off. (no separable: disminuir) | ES: Las ventas han disminuido.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Show up', 'Aparecer / Llegar', 'He showed up late. (ES: Él llegó tarde.)', 'Related: Arrive / Appear
Context: Contexto diferente: "Show up" = aparecer (informal). "Arrive" = llegar (formal). "Appear" = aparecer (formal). Intercambiables pero "show up" es más casual.
Examples:
1. He showed up late. | ES: Él llegó tarde.
2. She showed up unexpectedly. | ES: Ella apareció inesperadamente.
3. They showed up at the party. | ES: Ellos llegaron a la fiesta.
4. He didn''t show up. | ES: Él no se presentó.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Stay up', 'Trasnochar', 'I stayed up all night. (ES: Me quedé despierto toda la noche.)', 'Related: Not sleep
Context: Contexto diferente: "Stay up" = trasnochar (informal). "Not sleep" = no dormir (literal). Intercambiables pero "stay up" es más natural.
Examples:
1. I stayed up all night. | ES: Me quedé despierto toda la noche.
2. She stays up late. | ES: Ella se queda despierta hasta tarde.
3. Don''t stay up too late. | ES: No te quedes despierto hasta muy tarde.
4. We stayed up talking. | ES: Nos quedamos despiertos hablando.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Sleep in', 'Dormir hasta tarde', 'I slept in on Sunday. (ES: El domingo me levantó tarde.)', 'Related: Sleep late
Context: Contexto diferente: "Sleep in" = dormir hasta tarde (informal). "Sleep late" = dormir tarde. Intercambiables pero "sleep in" es más común.
Examples:
1. I slept in on Sunday. | ES: El domingo me levantó tarde.
2. She likes to sleep in. | ES: A ella le gusta dormir hasta tarde.
3. We slept in until noon. | ES: Nos quedamos dormidos hasta el mediodía.
4. Don''t sleep in tomorrow. | ES: No te levantes tarde mañana.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Get dressed', 'Vestirse', 'Get dressed quickly! (ES: ¡Vístete rápido!)', 'Related: Dress
Context: Contexto diferente: "Get dressed" = vestirse (informal). "Dress" = vestir (formal). Intercambiables pero "get dressed" es más común.
Examples:
1. Get dressed quickly! | ES: ¡Vístete rápido!
2. She got dressed for work. | ES: Ella se vistió para ir al trabajo.
3. He got dressed in a hurry. | ES: Él se vistió apresuradamente.
4. Get dressed, we''re late. | ES: Vístete, vamos tarde.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Hurry up', 'Apurarse', 'Hurry up, we''re late! (ES: ¡Apúrate, vamos tarde!)', 'Related: Rush / Speed up
Context: Contexto diferente: "Hurry up" = apurarse (informal). "Rush" = apurarse (formal). "Speed up" = acelerar (formal). Intercambiables pero "hurry up" es más común.
Examples:
1. Hurry up, we''re late! | ES: ¡Apúrate, vamos tarde!
2. She hurried up the stairs. | ES: Ella subió las escaleras a toda prisa.
3. Hurry up with the food. | ES: Apúrate con la comida.
4. He hurried up to catch the bus. | ES: Se apresuró para alcanzar el autobús.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Slow down', 'Bajar la velocidad', 'Slow down, it''s dangerous. (ES: Baja la velocidad, es peligroso.)', 'Related: Decelerate
Context: Contexto diferente: "Slow down" = bajar velocidad (informal). "Decelerate" = desacelerar (formal). Intercambiables pero "slow down" es más común.
Examples:
1. Slow down, it''s dangerous. | ES: Baja la velocidad, es peligroso.
2. She slowed down the car. / She slowed the car down. / She slowed it down. (⚠️ "it" en medio) | ES: Ella redujo la velocidad del coche.
3. Slow down, I can''t understand. | ES: Habla más despacio, no puedo entender.
4. The economy slowed down. | ES: La economía se desaceleró.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Set up', 'Configurar / Arreglar', 'Set up the meeting. / Set the meeting up. / Set it up. (⚠️ "it" en medio) (ES: Organiza la reunión.)', 'Related: Arrange / Configure
Context: Contexto diferente: "Set up" = configurar/arreglar (informal) o incriminar (figurado). "Arrange" = arreglar (formal). "Configure" = configurar (formal). NO siempre intercambiables.
Examples:
1. Set up the meeting. / Set the meeting up. / Set it up. (⚠️ "it" en medio) | ES: Organiza la reunión.
2. She set up the computer. / She set the computer up. / She set it up. | ES: Ella configuró la computadora.
3. He set up a business. / He set a business up. / He set it up. | ES: Él creó una empresa.
4. They set up the tent. / They set the tent up. / They set it up. | ES: Ellos montaron la tienda de campaña.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Work out', 'Ejercitarse / Funcionar / Resolver', 'I work out at the gym. (no separable: ejercitarse) (ES: Hago ejercicio en el gimnasio.)', 'Related: Exercise / Solve / Succeed
Context: Contexto diferente: "Work out" = ejercitarse, funcionar, o resolver (informal). "Exercise" = ejercitarse (formal). "Solve" = resolver (formal). "Succeed" = tener éxito (formal). NO siempre intercambiables.
Examples:
1. I work out at the gym. (no separable: ejercitarse) | ES: Hago ejercicio en el gimnasio.
2. Everything will work out. (no separable: salir bien) | ES: Todo saldrá bien.
3. She worked out the problem. / She worked the problem out. / She worked it out. (⚠️ "it" en medio) | ES: Ella resolvió el problema.
4. This plan didn''t work out. (no separable) | ES: Este plan no funcionó.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Make sure', 'Asegurarse', 'Make sure you lock the door. (cláusula, no separable) (ES: Asegúrate de cerrar la puerta con llave.)', 'Related: Ensure / Verify
Context: Contexto diferente: "Make sure" = asegurarse (informal). "Ensure" = asegurar (formal). "Verify" = verificar (formal). Intercambiables pero "make sure" es más común.
Examples:
1. Make sure you lock the door. (cláusula, no separable) | ES: Asegúrate de cerrar la puerta con llave.
2. Make sure to call me. | ES: Asegúrate de llamarme.
3. She made sure everything was ready. | ES: Ella se aseguró de que todo estuviera listo.
4. Make sure you''re on time. | ES: Asegúrate de llegar a tiempo.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Plan on', 'Planear', 'I plan on traveling next year. (⚠️ "it": plan on it ✅ / plan it on ❌) (ES: Planeo viajar el próximo año.)', 'Related: Plan / Intend
Context: Contexto diferente: "Plan on" = planear (informal). "Plan" = planear (general). "Intend" = tener la intención (formal). Intercambiables pero "plan on" es más casual.
Examples:
1. I plan on traveling next year. (⚠️ "it": plan on it ✅ / plan it on ❌) | ES: Planeo viajar el próximo año.
2. She plans on studying medicine. | ES: Ella piensa estudiar medicina.
3. We plan on moving. | ES: Planeamos mudarnos.
4. He plans on retiring early. | ES: Él piensa jubilarse temprano.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Count on', 'Contar con', 'You can count on me. (⚠️ "me" va después: count on me ✅ / count me on ❌) (ES: Puedes contar conmigo.)', 'Related: Rely on / Trust
Context: Contexto diferente: "Count on" = contar con (informal). "Rely on" = depender de (formal). "Trust" = confiar. Intercambiables pero "count on" es más común en conversación.
Examples:
1. You can count on me. (⚠️ "me" va después: count on me ✅ / count me on ❌) | ES: Puedes contar conmigo.
2. I count on my friends. | ES: Cuento con mis amigos.
3. Don''t count on him. (⚠️ "him" va después) | ES: No cuentes con él.
4. We count on your support. | ES: Contamos con tu apoyo.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Wait for', 'Esperar', 'I''m waiting for the bus. (⚠️ "it": waiting for it ✅ / waiting it for ❌) (ES: Estoy esperando el autobús.)', 'Related: Await
Context: Contexto diferente: "Wait for" = esperar (informal). "Await" = esperar (formal). Intercambiables pero "wait for" es más común.
Examples:
1. I''m waiting for the bus. (⚠️ "it": waiting for it ✅ / waiting it for ❌) | ES: Estoy esperando el autobús.
2. She waited for him. (⚠️ "him" va después) | ES: Ella lo esperó.
3. We waited for the results. | ES: Esperamos los resultados.
4. Wait for me! (⚠️ "me" va después) | ES: ¡Espérame!'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Ask for', 'Pedir', 'She asked for help. (⚠️ "it": asked for it ✅ / asked it for ❌) (ES: Ella pidió ayuda.)', 'Related: Request
Context: Contexto diferente: "Ask for" = pedir (informal). "Request" = solicitar (formal). Intercambiables pero "ask for" es más común.
Examples:
1. She asked for help. (⚠️ "it": asked for it ✅ / asked it for ❌) | ES: Ella pidió ayuda.
2. He asked for more time. | ES: Él pidió más tiempo.
3. They asked for directions. | ES: Ellos pidieron indicaciones.
4. Ask for the manager. | ES: Pide hablar con el gerente.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Hope for', 'Esperar', 'We hope for the best. (⚠️ "it": hope for it ✅ / hope it for ❌) (ES: Esperamos que todo salga bien.)', 'Related: Wish / Desire
Context: Contexto diferente: "Hope for" = esperar (informal). "Wish" = desear. "Desire" = desear (formal). Intercambiables pero "hope for" es más común.
Examples:
1. We hope for the best. (⚠️ "it": hope for it ✅ / hope it for ❌) | ES: Esperamos que todo salga bien.
2. She hopes for a promotion. | ES: Ella espera conseguir un ascenso.
3. They hoped for good weather. | ES: Esperaban que hiciera buen tiempo.
4. I hope for peace. | ES: Espero que haya paz.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Go for', 'Ir por / Intentar', 'Go for it! (⚠️ "it" va después: go for it ✅ / go it for ❌) (ES: ¡Anímate!)', 'Related: Try / Choose
Context: Contexto diferente: "Go for" = ir por (informal) o intentar. "Try" = intentar. "Choose" = elegir. NO siempre intercambiables.
Examples:
1. Go for it! (⚠️ "it" va después: go for it ✅ / go it for ❌) | ES: ¡Anímate!
2. She went for the job. | ES: Ella solicitó el puesto.
3. He went for the gold. | ES: Él fue por la medalla de oro.
4. Let''s go for a walk. | ES: Vamos a dar un paseo.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Come up with', 'Ocurrirse / Idear', 'I came up with a great idea. (⚠️ "it": came up with it ✅ / came it up with ❌) (ES: Se me ocurrió una gran idea.)', 'Related: Invent / Think of
Context: Contexto diferente: "Come up with" = ocurrirse/idear (informal). "Invent" = inventar (formal). "Think of" = pensar en. Intercambiables pero "come up with" es más común.
Examples:
1. I came up with a great idea. (⚠️ "it": came up with it ✅ / came it up with ❌) | ES: Se me ocurrió una gran idea.
2. She came up with a solution. | ES: A ella se le ocurrió una solución.
3. He came up with a plan. | ES: A Él se le ocurrió un plan.
4. They came up with a new product. | ES: A ellos se les ocurrió un producto nuevo.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Use up', 'Agotar', 'She used up all the paper. / She used all the paper up. / She used it up. (⚠️ "it" en medio) (ES: Ella gastó todo el papel.)', 'Related: Consume / Deplete
Context: Contexto diferente: "Use up" = agotar (informal). "Consume" = consumir (formal). "Deplete" = agotar (formal). Intercambiables pero "use up" es más común.
Examples:
1. She used up all the paper. / She used all the paper up. / She used it up. (⚠️ "it" en medio) | ES: Ella gastó todo el papel.
2. He used up his savings. / He used his savings up. / He used them up. | ES: Él agotó sus ahorros.
3. We used up the milk. / We used the milk up. / We used it up. | ES: Nos acabamos la leche.
4. Don''t use up all the hot water. / Don''t use all the hot water up. / Don''t use it up. | ES: No gastes toda el agua caliente.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Give out', 'Agotarse / Distribuir', 'The batteries gave out. (no separable: agotarse) (ES: Se agotaron las baterías.)', 'Related: Distribute / Run out
Context: Contexto diferente: "Give out" = agotarse (fuerza/batería) o distribuir. "Distribute" = distribuir (formal). "Run out" = agotarse. NO siempre intercambiables.
Examples:
1. The batteries gave out. (no separable: agotarse) | ES: Se agotaron las baterías.
2. She gave out the papers. / She gave the papers out. / She gave them out. (⚠️ "them" en medio) | ES: Ella repartió los documentos.
3. His strength gave out. (no separable) | ES: Se le acabaron las fuerzas.
4. They gave out free samples. / They gave free samples out. / They gave them out. | ES: Repartieron muestras gratis.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Go without', 'Prescindir de', 'I went without sleep. (⚠️ "it": went without it ✅ / went it without ❌) (ES: Pasé una noche sin dormir.)', 'Related: Lack / Do without
Context: Contexto diferente: "Go without" = prescindir de (informal). "Lack" = carecer de (formal). "Do without" = prescindir de. Intercambiables pero "go without" es más común.
Examples:
1. I went without sleep. (⚠️ "it": went without it ✅ / went it without ❌) | ES: Pasé una noche sin dormir.
2. She went without food. | ES: Ella pasó sin comida.
3. He went without his phone. | ES: Él estuvo sin su teléfono.
4. We went without electricity. | ES: Estuvimos sin electricidad.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Cut down on', 'Reducir', 'I need to cut down on sugar. (⚠️ "it": cut down on it ✅ / cut it down on ❌) (ES: Necesito reducir el consumo de azúcar.)', 'Related: Reduce / Decrease
Context: Contexto diferente: "Cut down on" = reducir (informal). "Reduce" = reducir (formal). "Decrease" = disminuir (formal). Intercambiables pero "cut down on" es más común.
Examples:
1. I need to cut down on sugar. (⚠️ "it": cut down on it ✅ / cut it down on ❌) | ES: Necesito reducir el consumo de azúcar.
2. She cut down on smoking. | ES: Ella redujo el consumo de tabaco.
3. He cut down on expenses. | ES: Él redujo sus gastos.
4. Cut down on screen time. | ES: Reduce el tiempo que pasas frente a la pantalla.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Do without', 'Prescindir de', 'I can''t do without my phone. (⚠️ "it": do without it ✅ / do it without ❌) (ES: No puedo vivir sin mi teléfono.)', 'Related: Lack / Go without
Context: Contexto diferente: "Do without" = prescindir de (informal). "Lack" = carecer de (formal). "Go without" = prescindir de. Intercambiables pero "do without" es más común en US.
Examples:
1. I can''t do without my phone. (⚠️ "it": do without it ✅ / do it without ❌) | ES: No puedo vivir sin mi teléfono.
2. She did without makeup. | ES: Ella prescindió del maquillaje.
3. He did without dinner. | ES: Él prescindió de la cena.
4. We did without a car. | ES: Nos las arreglamos sin coche.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Inseparable', 'Run low on', 'Estar escaso de', 'We''re running low on gas. (⚠️ "it": running low on it ✅ / running it low on ❌) (ES: Nos estamos quedando sin gasolina.)', 'Related: Be short of
Context: Contexto diferente: "Run low on" = estar escaso de (informal). "Be short of" = estar falto de (formal). Intercambiables pero "run low on" es más común.
Examples:
1. We''re running low on gas. (⚠️ "it": running low on it ✅ / running it low on ❌) | ES: Nos estamos quedando sin gasolina.
2. She''s running low on patience. | ES: A ella se le está acabando la paciencia.
3. We''re running low on supplies. | ES: Nos estamos quedando sin suministros.
4. The team is running low on players. | ES: El equipo se está quedando sin jugadores.'),
    ('Phrasal Verbs - Rutina diaria y acciones comunes', 'Separable', 'Stock up on', 'Abastecerse de', 'We stocked up on food. (⚠️ "it": stocked up on it ✅ / stocked it up on ❌) (ES: Nos abastecimos de comida.)', 'Related: Accumulate / Supply
Context: Contexto diferente: "Stock up on" = abastecerse de (informal). "Accumulate" = acumular (formal). "Supply" = suministrar (formal). Intercambiables pero "stock up on" es más común.
Examples:
1. We stocked up on food. (⚠️ "it": stocked up on it ✅ / stocked it up on ❌) | ES: Nos abastecimos de comida.
2. She stocked up on water. | ES: Ella se abasteció de agua.
3. They stocked up on supplies. | ES: Ellos acumularon suministros.
4. Stock up on essentials. | ES: Abastécete de lo esencial.'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Take care (of)', 'Cuidar / Cuidarse', 'Take care of your sister. (⚠️ "her": take care of her ✅ / take her care of ❌) (ES: Cuida a tu hermana.)', 'Related: Protect / Look after
Context: Contexto diferente: "Take care of" = cuidar (US, común). "Take care" = despedida (cuídate). "Protect" = proteger (formal). "Look after" = cuidar (UK). Intercambiables en contexto de cuidar, pero "take care" también es despedida.
Examples:
1. Take care of your sister. (⚠️ "her": take care of her ✅ / take her care of ❌) | ES: Cuida a tu hermana.
2. Take care! (despedida) | ES: Cuídate.
3. She takes care of the house. | ES: Ella cuida de la casa.
4. He takes care of his health. | ES: Él cuida su salud.'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Watch out', 'Tener cuidado', 'Watch out! There''s a car! (ES: ¡Cuidado! ¡Hay un coche!)', 'Related: Be careful
Context: Contexto diferente: "Watch out" = tener cuidado (urgente). "Be careful" = tener cuidado (neutral). Intercambiables pero "watch out" es más urgente.
Examples:
1. Watch out! There''s a car! | ES: ¡Cuidado! ¡Hay un coche!
2. Watch out for snakes. | ES: Cuidado con las serpientes.
3. Watch out for pickpockets. | ES: Cuidado con los carteristas.
4. Watch out! | ES: ¡Ten cuidado!'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Be careful', 'Tener cuidado', 'Be careful with the glass. (ES: Ten cuidado con el vaso.)', 'Related: Watch out / Look out
Context: Contexto diferente: "Be careful" = tener cuidado (neutral). "Watch out" = tener cuidado (urgente). "Look out" = tener cuidado (informal). Intercambiables pero "be careful" es más neutral.
Examples:
1. Be careful with the glass. | ES: Ten cuidado con el vaso.
2. Be careful driving. | ES: Ten cuidado al conducir.
3. Be careful with your words. | ES: Ten cuidado con tus palabras.
4. Be careful! | ES: ¡Ten cuidado!'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Keep an eye on', 'Vigilar', 'Keep an eye on the kids. (⚠️ "them": keep an eye on them ✅ / keep them an eye on ❌) (ES: Vigila a los niños.)', 'Related: Watch / Monitor
Context: Contexto diferente: "Keep an eye on" = vigilar (informal). "Watch" = mirar. "Monitor" = monitorear (formal). Intercambiables pero "keep an eye on" es más casual.
Examples:
1. Keep an eye on the kids. (⚠️ "them": keep an eye on them ✅ / keep them an eye on ❌) | ES: Vigila a los niños.
2. Keep an eye on the soup. | ES: Vigila la sopa.
3. Keep an eye on your bag. | ES: Vigila tu bolso.
4. Keep an eye on the news. | ES: Mantente al tanto de las noticias.'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Check on', 'Verificar', 'Check on the baby. (⚠️ "him": check on him ✅ / check him on ❌) (ES: Ve a ver cómo está el bebé.)', 'Related: Verify / Inspect
Context: Contexto diferente: "Check on" = verificar (informal). "Verify" = verificar (formal). "Inspect" = inspeccionar (formal). Intercambiables pero "check on" es más común.
Examples:
1. Check on the baby. (⚠️ "him": check on him ✅ / check him on ❌) | ES: Ve a ver cómo está el bebé.
2. Check on the project. | ES: Revisa el proyecto.
3. Check on your email. | ES: Revisa tu correo.
4. Check on the guests. | ES: Ve a ver cómo están los invitados.'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Care for', 'Cuidar / Querer', 'She cares for the elderly. (⚠️ "them": cares for them ✅ / cares them for ❌) (ES: Ella cuida de las personas mayores.)', 'Related: Look after / Love
Context: Contexto diferente: "Care for" = cuidar (formal) o querer (formal). "Look after" = cuidar (informal). "Love" = amar. NO siempre intercambiables.
Examples:
1. She cares for the elderly. (⚠️ "them": cares for them ✅ / cares them for ❌) | ES: Ella cuida de las personas mayores.
2. He cares for his dog. | ES: Él cuida de su perro.
3. I care for you. | ES: Te quiero.
4. Who will care for the plants? | ES: ¿Quién cuidará de las plantas?'),
    ('Phrasal Verbs - Cuidado y responsabilidad', 'Inseparable', 'Watch over', 'Vigilar', 'She watched over the kids. (⚠️ "them": watched over them ✅ / watched them over ❌) (ES: Ella cuidó de los niños.)', 'Related: Guard / Protect
Context: Contexto diferente: "Watch over" = vigilar (más formal/protector). "Guard" = guardar (formal). "Protect" = proteger (formal). Intercambiables pero "watch over" es más protector.
Examples:
1. She watched over the kids. (⚠️ "them": watched over them ✅ / watched them over ❌) | ES: Ella cuidó de los niños.
2. He watched over the house. | ES: Él vigiló la casa.
3. The angel watches over you. | ES: El ángel vela por ti.
4. Watch over my bag. | ES: Vigila mi bolso.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Have fun', 'Divertirse', 'Have fun at the party! (ES: ¡Diviértete en la fiesta!)', 'Related: Enjoy oneself
Context: Contexto diferente: "Have fun" = divertirse (informal). "Enjoy oneself" = divertirse (formal). Intercambiables pero "have fun" es mucho más común.
Examples:
1. Have fun at the party! | ES: ¡Diviértete en la fiesta!
2. We had fun at the beach. | ES: Nos divertimos en la playa.
3. Have fun! | ES: ¡Diviértete!
4. She had fun with her friends. | ES: Ella se divirtió con sus amigos.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Joke around', 'Bromear', 'Stop joking around! (ES: ¡Deja de bromear!)', 'Related: Joke / Kid
Context: Contexto diferente: "Joke around" = bromear (informal). "Joke" = bromear (general). "Kid" = bromear (informal). Intercambiables pero "joke around" implica tonteo.
Examples:
1. Stop joking around! | ES: ¡Deja de bromear!
2. He''s always joking around. | ES: Él siempre está bromeando.
3. We joked around all night. | ES: Bromeamos toda la noche.
4. Don''t joke around about that. | ES: No bromees con eso.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Mess around', 'Juguetear / Perder el tiempo', 'Stop messing around. (ES: Deja de hacer tonterías.)', 'Related: Waste time / Fool around
Context: Contexto diferente: "Mess around" = juguetear/perder tiempo (informal). "Waste time" = perder tiempo (formal). "Fool around" = bromear. Intercambiables pero "mess around" puede implicar desorden.
Examples:
1. Stop messing around. | ES: Deja de hacer tonterías.
2. He messed around all day. | ES: Él perdió el tiempo todo el día.
3. Don''t mess around with her. | ES: No te metas con ella.
4. They messed around in class. | ES: Ellos hicieron tonterías en clase.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Fool around', 'Bromear / Perder tiempo', 'Stop fooling around! (ES: ¡Deja de hacer tonterías!)', 'Related: Joke / Waste time
Context: Contexto diferente: "Fool around" = bromear/perder tiempo (informal). "Joke" = bromear. "Waste time" = perder tiempo. Intercambiables pero "fool around" puede implicar tontería.
Examples:
1. Stop fooling around! | ES: ¡Deja de hacer tonterías!
2. He fooled around at work. | ES: Él hizo el tonto en el trabajo.
3. Don''t fool around with matches. | ES: No juegues con cerillas.
4. They fooled around all afternoon. | ES: Estuvieron haciendo tonterías toda la tarde.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Hang out', 'Pasar el rato', 'Let''s hang out tomorrow. (ES: Salgamos mañana.)', 'Related: Spend time / Socialize
Context: Contexto diferente: "Hang out" = pasar el rato (informal). "Spend time" = pasar tiempo (formal). "Socialize" = socializar (formal). Intercambiables pero "hang out" es más casual.
Examples:
1. Let''s hang out tomorrow. | ES: Salgamos mañana.
2. We hung out at the mall. | ES: Pasamos el rato en el centro comercial.
3. She hangs out with her friends. | ES: Ella pasa el rato con sus amigos.
4. Do you want to hang out? | ES: ¿Quieres pasar el rato?'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Goof off', 'Holgazanear', 'He goofs off at work. (ES: Él pierde el tiempo en el trabajo.)', 'Related: Waste time / Lazy around
Context: Contexto diferente: "Goof off" = holgazanear (informal). "Waste time" = perder tiempo (formal). "Lazy around" = holgazanear (informal). Intercambiables pero "goof off" es más común en US.
Examples:
1. He goofs off at work. | ES: Él pierde el tiempo en el trabajo.
2. Stop goofing off! | ES: ¡Deja de holgazanear!
3. They goofed off all day. | ES: Holgazanearon todo el día.
4. Don''t goof off during class. | ES: No holgazanees durante la clase.'),
    ('Phrasal Verbs - Diversión Y Bromas', 'Inseparable', 'Party hard', 'Festejar mucho', 'They partied hard all night. (ES: Estuvieron de fiesta toda la noche.)', 'Related: Celebrate a lot
Context: Contexto diferente: "Party hard" = festejar mucho (informal). "Celebrate a lot" = celebrar mucho (formal). Intercambiables pero "party hard" es más juvenil.
Examples:
1. They partied hard all night. | ES: Estuvieron de fiesta toda la noche.
2. We partied hard at the wedding. | ES: Nos divertimos mucho en la boda.
3. She parties hard on weekends. | ES: Ella festeja a lo grande los fines de semana.
4. Let''s party hard! | ES: ¡Vamos a festejar a lo grande!'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Inseparable', 'Give up', 'Rendirse / Dejar un hábito', 'Never give up on your dreams. (⚠️ "it": give up on it ✅ / give it up on ❌) (ES: Nunca renuncies a tus sueños.)', 'Related: Quit / Surrender / Stop
Context: Contexto diferente: "Give up" = rendirse o dejar un hábito (informal). "Quit" = dejar (informal). "Surrender" = rendirse (formal). "Stop" = parar. NO siempre intercambiables.
Examples:
1. Never give up on your dreams. (⚠️ "it": give up on it ✅ / give it up on ❌) | ES: Nunca renuncies a tus sueños.
2. I gave up smoking. | ES: Dejé de fumar.
3. She gave up her seat. / She gave her seat up. / She gave it up. (⚠️ "it" en medio) | ES: Ella cedió su asiento.
4. The criminal gave himself up. | ES: El criminal se entregó.'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Inseparable', 'Give in', 'Ceder / Rendirse ante algo', 'She finally gave in. (ES: Ella finalmente cedió.)', 'Related: Surrender / Yield
Context: Contexto diferente: "Give in" = ceder (informal). "Surrender" = rendirse (formal). "Yield" = ceder (formal). Intercambiables pero "give in" es más común.
Examples:
1. She finally gave in. | ES: Ella finalmente cedió.
2. Don''t give in to peer pressure. | ES: No cedas ante la presión del grupo.
3. The rebels gave in. | ES: Los rebeldes se rindieron.
4. He gave in and accepted. | ES: Él cedió y aceptó.'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Separable', 'Pull off', 'Lograr', 'She pulled off the deal. / She pulled the deal off. / She pulled it off. (⚠️ "it" en medio) (ES: Ella logró cerrar el trato.)', 'Related: Achieve / Succeed
Context: Contexto diferente: "Pull off" = lograr algo difícil (informal). "Achieve" = lograr (formal). "Succeed" = tener éxito (formal). Intercambiables pero "pull off" implica dificultad.
Examples:
1. She pulled off the deal. / She pulled the deal off. / She pulled it off. (⚠️ "it" en medio) | ES: Ella logró cerrar el trato.
2. He pulled off a miracle. / He pulled a miracle off. / He pulled it off. | ES: Él logró un milagro.
3. They pulled off the surprise. / They pulled the surprise off. / They pulled it off. | ES: Ellos lograron dar la sorpresa.
4. Can you pull it off? / Can you pull off it ❌ | ES: ¿Puedes lograrlo?'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Separable', 'Mess up', 'Arruinar / Equivocarse', 'I messed up the exam. / I messed the exam up. / I messed it up. (⚠️ "it" en medio) (ES: Arruiné el examen.)', 'Related: Ruin / Make a mistake
Context: Contexto diferente: "Mess up" = arruinar (informal). "Ruin" = arruinar (formal). "Make a mistake" = equivocarse (formal). Intercambiables pero "mess up" es más común.
Examples:
1. I messed up the exam. / I messed the exam up. / I messed it up. (⚠️ "it" en medio) | ES: Arruiné el examen.
2. She messed up the recipe. / She messed the recipe up. / She messed it up. | ES: Ella arruinó la receta.
3. He messed up his chance. / He messed his chance up. / He messed it up. | ES: Él arruinó su oportunidad.
4. Don''t mess up! | ES: ¡No lo arruines!'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Separable', 'Screw up', 'Arruinar / Equivocarse', 'He screwed up again. / He screwed it up again. (⚠️ "it" en medio) (ES: Él volvió a meter la pata.)', 'Related: Ruin / Fail
Context: Contexto diferente: "Screw up" = arruinar (informal/vulgar). "Ruin" = arruinar (formal). "Fail" = fallar (formal). Intercambiables pero "screw up" es más informal.
Examples:
1. He screwed up again. / He screwed it up again. (⚠️ "it" en medio) | ES: Él volvió a meter la pata.
2. I screwed up the project. / I screwed the project up. / I screwed it up. | ES: Arruiné el proyecto.
3. She screwed up her life. / She screwed her life up. / She screwed it up. | ES: Ella arruinó su vida.
4. Don''t screw up! | ES: ¡No metas la pata!'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Inseparable', 'Fall through', 'Fracasar / No concretarse', 'The plan fell through. (ES: El plan fracasó.)', 'Related: Fail / Collapse
Context: Contexto diferente: "Fall through" = no concretarse (informal). "Fail" = fracasar (formal). "Collapse" = colapsar (formal). Intercambiables pero "fall through" es más específico de planes.
Examples:
1. The plan fell through. | ES: El plan fracasó.
2. The deal fell through. | ES: El acuerdo no se concretó.
3. Our trip fell through. | ES: Nuestro viaje se canceló.
4. The sale fell through. | ES: La venta no se concretó.'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Inseparable', 'Come through', 'Cumplir / Tener éxito', 'He came through for us. (⚠️ "us" va después: came through for us ✅) (ES: Él cumplió con nosotros.)', 'Related: Succeed / Deliver
Context: Contexto diferente: "Come through" = cumplir (informal). "Succeed" = tener éxito (formal). "Deliver" = entregar/cumplir (formal). Intercambiables pero "come through" es más personal.
Examples:
1. He came through for us. (⚠️ "us" va después: came through for us ✅) | ES: Él cumplió con nosotros.
2. She came through with the money. | ES: Ella consiguió el dinero.
3. They came through in the end. | ES: Ellos finalmente cumplieron.
4. I knew you''d come through. | ES: Sabía que cumplirías.'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Separable', 'Make it', 'Lograrlo', 'You can make it! (ES: ¡Puedes lograrlo!)', 'Related: Succeed / Achieve
Context: Contexto diferente: "Make it" = lograrlo (informal). "Succeed" = tener éxito (formal). "Achieve" = lograr (formal). Intercambiables pero "make it" es más común.
Examples:
1. You can make it! | ES: ¡Puedes lograrlo!
2. She made it to the top. | ES: Ella llegó a la cima.
3. He made it through college. | ES: Él logró terminar la universidad.
4. We made it! | ES: ¡Lo logramos!'),
    ('Phrasal Verbs - Éxito Y Fracaso', 'Inseparable', 'End up', 'Terminar haciendo/algo', 'We ended up staying home. (ES: Terminamos quedándonos en casa.)', 'Related: Finish / Result in
Context: Contexto diferente: "End up" = terminar (informal, con sorpresa). "Finish" = terminar (formal). "Result in" = resultar en (formal). NO siempre intercambiables.
Examples:
1. We ended up staying home. | ES: Terminamos quedándonos en casa.
2. She ended up marrying him. | ES: Ella terminó casándose con él.
3. He ended up in jail. | ES: Él terminó en la cárcel.
4. I ended up paying for everyone. | ES: Terminé pagando por todos.'),
    ('Phrasal Verbs - Relaciones', 'Inseparable', 'Get along (with)', 'Llevarse bien', 'I get along with my sister. (⚠️ "her": get along with her ✅ / get her along with ❌) (ES: Me llevo bien con mi hermana.)', 'Related: Get on with
Context: Contexto diferente: "Get along with" = llevarse bien (US). "Get on with" = llevarse bien (UK). Intercambiables 100%.
Examples:
1. I get along with my sister. (⚠️ "her": get along with her ✅ / get her along with ❌) | ES: Me llevo bien con mi hermana.
2. Do you get along with your coworkers? | ES: ¿Te llevas bien con tus compañeros de trabajo?
3. They don''t get along. | ES: Ellos no se llevan bien.
4. She gets along with everyone. | ES: Ella se lleva bien con todos.'),
    ('Phrasal Verbs - Relaciones', 'Inseparable', 'Get over', 'Superar (enfermedad/ruptura)', 'I need to get over this flu. (⚠️ "it": get over it ✅ / get it over ❌) (ES: Necesito recuperarme de esta gripe.)', 'Related: Recover from / Overcome
Context: Contexto diferente: "Get over" = superar (informal). "Recover from" = recuperarse de (formal). "Overcome" = superar (formal). Intercambiables pero "get over" es más común.
Examples:
1. I need to get over this flu. (⚠️ "it": get over it ✅ / get it over ❌) | ES: Necesito recuperarme de esta gripe.
2. She can''t get over her ex. | ES: Ella no logra superar a su ex.
3. He got over the shock. | ES: Él superó la conmoción.
4. I can''t get over how beautiful she is. | ES: No puedo dejar de asombrarme de lo hermosa que es.'),
    ('Phrasal Verbs - Relaciones', 'Separable', 'Get rid of', 'Deshacerse de', 'I need to get rid of this furniture. (⚠️ "it": get rid of it ✅ / get it rid of ❌) (ES: Necesito deshacerme de estos muebles.)', 'Related: Dispose of / Eliminate
Context: Contexto diferente: "Get rid of" = deshacerse de (informal). "Dispose of" = deshacerse de (formal). "Eliminate" = eliminar (formal). Intercambiables pero "get rid of" es más común.
Examples:
1. I need to get rid of this furniture. (⚠️ "it": get rid of it ✅ / get it rid of ❌) | ES: Necesito deshacerme de estos muebles.
2. She got rid of her bad habits. | ES: Ella eliminó sus malos hábitos.
3. We got rid of the pests. | ES: Nos deshicimos de las plagas.
4. He got rid of her stuff. | ES: Él se deshizo de sus cosas.'),
    ('Phrasal Verbs - Relaciones', 'Separable', 'Break up', 'Terminar (relación)', 'They broke up last week. (ES: Terminaron su relación la semana pasada.)', 'Related: Separate / End relationship
Context: Contexto diferente: "Break up" = terminar relación (informal). "Separate" = separarse (formal). "End relationship" = terminar relación (formal). Intercambiables pero "break up" es más común.
Examples:
1. They broke up last week. | ES: Terminaron su relación la semana pasada.
2. She broke up with him. (⚠️ "him" va después: broke up with him ✅) | ES: Ella terminó con él.
3. We broke up after 2 years. | ES: Terminamos después de dos años.
4. He''s still not over the breakup. | ES: Él todavía no ha superado la ruptura.'),
    ('Phrasal Verbs - Relaciones', 'Separable', 'Make up', 'Reconciliarse / Inventar', 'They made up after the fight. (ES: Se reconciliaron después de la pelea.)', 'Related: Reconcile / Invent
Context: Contexto diferente: "Make up" = reconciliarse o inventar (informal). "Reconcile" = reconciliarse (formal). "Invent" = inventar (formal). NO siempre intercambiables.
Examples:
1. They made up after the fight. | ES: Se reconciliaron después de la pelea.
2. She made up a story. / She made a story up. / She made it up. (⚠️ "it" en medio) | ES: Ella inventó una historia.
3. He made up an excuse. / He made an excuse up. / He made it up. | ES: Él inventó una excusa.
4. Let''s make up. | ES: Reconciliémonos.'),
    ('Phrasal Verbs - Relaciones', 'Separable', 'Ask out', 'Invitar a salir', 'He asked her out. (⚠️ "her" en medio: asked out her ❌) (ES: Él la invitó a salir.)', 'Related: Invite on a date
Context: Contexto diferente: "Ask out" = invitar a salir (informal). "Invite on a date" = formal. Intercambiables pero "ask out" es más común.
Examples:
1. He asked her out. (⚠️ "her" en medio: asked out her ❌) | ES: Él la invitó a salir.
2. She asked him out. (⚠️ "him" en medio) | ES: Ella lo invitó a salir.
3. I''m going to ask her out. | ES: Voy a invitarla a salir.
4. He was too shy to ask her out. | ES: Era demasiado tímido para invitarla a salir.'),
    ('Phrasal Verbs - Relaciones', 'Inseparable', 'Cheat on', 'Engañar', 'He cheated on her. (⚠️ "her" va después: cheated on her ✅) (ES: Él le fue infiel.)', 'Related: Betray / Be unfaithful
Context: Contexto diferente: "Cheat on" = engañar (informal). "Betray" = traicionar (formal). "Be unfaithful" = ser infiel (formal). Intercambiables pero "cheat on" es más común.
Examples:
1. He cheated on her. (⚠️ "her" va después: cheated on her ✅) | ES: Él le fue infiel.
2. She cheated on him. | ES: Ella le fue infiel.
3. Don''t cheat on me. | ES: No me engañes.
4. He would never cheat on you. | ES: Él nunca te sería infiel.'),
    ('Phrasal Verbs - Relaciones', 'Inseparable', 'Put up with', 'Tolerar / Aguantar', 'I can''t put up with this. (⚠️ "it": put up with it ✅ / put it up with ❌) (ES: No puedo soportar esto.)', 'Related: Tolerate / Endure
Context: Contexto diferente: "Put up with" = tolerar (informal). "Tolerate" = tolerar (formal). "Endure" = aguantar (formal). Intercambiables pero "put up with" es más común.
Examples:
1. I can''t put up with this. (⚠️ "it": put up with it ✅ / put it up with ❌) | ES: No puedo soportar esto.
2. She puts up with a lot. | ES: Ella soporta muchas cosas.
3. How do you put up with him? | ES: ¿Cómo lo soportas?
4. I won''t put up with it. | ES: No voy a tolerarlo.'),
    ('Phrasal Verbs - Relaciones', 'Inseparable', 'Fall for', 'Enamorarse / Caer en trampa', 'She fell for him. (⚠️ "him" va después: fell for him ✅) (ES: Ella se enamoró de él.)', 'Related: Fall in love / Be deceived
Context: Contexto diferente: "Fall for" = enamorarse o caer en una trampa (informal). "Fall in love" = enamorarse (formal). "Be deceived" = ser engañado (formal). NO siempre intercambiables.
Examples:
1. She fell for him. (⚠️ "him" va después: fell for him ✅) | ES: Ella se enamoró de él.
2. He fell for the trick. | ES: Él cayó en la trampa.
3. Don''t fall for it. (⚠️ "it" va después) | ES: No caigas en eso.
4. I fell for you. | ES: Me enamoré de ti.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Pay back', 'Devolver dinero', 'I''ll pay you back tomorrow. (⚠️ "you" en medio) / I''ll pay back you ❌ (ES: Te devolveré el dinero mañana.)', 'Related: Repay / Refund
Context: Contexto diferente: "Pay back" = devolver dinero (informal). "Repay" = reembolsar (formal). "Refund" = reembolsar (formal). Intercambiables pero "pay back" es más común.
Examples:
1. I''ll pay you back tomorrow. (⚠️ "you" en medio) / I''ll pay back you ❌ | ES: Te devolveré el dinero mañana.
2. She paid back the loan. / She paid the loan back. / She paid it back. | ES: Ella devolvió el préstamo.
3. He never paid me back. (⚠️ "me" en medio) | ES: Él nunca me devolvió el dinero.
4. Pay back the money. / Pay the money back. / Pay it back. | ES: Devuelve el dinero.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Save up', 'Ahorrar', 'I''m saving up for a car. (⚠️ "it": saving up for it ✅ / saving it up for ❌) (ES: Estoy ahorrando para comprar un coche.)', 'Related: Save / Accumulate
Context: Contexto diferente: "Save up" = ahorrar (informal). "Save" = ahorrar (general). "Accumulate" = acumular (formal). Intercambiables pero "save up" implica esfuerzo.
Examples:
1. I''m saving up for a car. (⚠️ "it": saving up for it ✅ / saving it up for ❌) | ES: Estoy ahorrando para comprar un coche.
2. She saved up for a trip. | ES: Ella ahorró para un viaje.
3. He''s saving up to buy a house. | ES: Él está ahorrando para comprar una casa.
4. We saved up all year. | ES: Ahorramos durante todo el año.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Sell out', 'Agotarse / Traicionar', 'The tickets sold out. (no separable: agotarse) (ES: Las entradas se agotaron.)', 'Related: Sell everything / Betray
Context: Contexto diferente: "Sell out" = agotarse (entradas) o traicionar (figurado). "Sell everything" = vender todo. "Betray" = traicionar (formal). NO siempre intercambiables.
Examples:
1. The tickets sold out. (no separable: agotarse) | ES: Las entradas se agotaron.
2. The store sold out of bread. | ES: La tienda se quedó sin pan.
3. He sold out his friends. / He sold his friends out. / He sold them out. (⚠️ "them" en medio) | ES: Él traicionó a sus amigos.
4. The concert sold out. | ES: Las entradas para el concierto se agotaron.'),
    ('Phrasal Verbs - Dinero y compras', 'Inseparable', 'Shop around', 'Comparar precios', 'Shop around before buying. (ES: Compara precios antes de comprar.)', 'Related: Compare / Browse
Context: Contexto diferente: "Shop around" = comparar precios (informal). "Compare" = comparar (formal). "Browse" = mirar. Intercambiables pero "shop around" implica buscar mejor precio.
Examples:
1. Shop around before buying. | ES: Compara precios antes de comprar.
2. She shopped around for a better deal. | ES: Ella comparó precios para encontrar una oferta mejor.
3. Shop around for insurance. | ES: Compara precios de seguros.
4. We shopped around all day. | ES: Estuvimos comparando precios todo el día.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Pay off', 'Pagar / Dar resultado', 'The investment paid off. (no separable: dar resultado) (ES: La inversión dio resultado.)', 'Related: Repay / Succeed
Context: Contexto diferente: "Pay off" = pagar una deuda o dar resultado (figurado). "Repay" = reembolsar (formal). "Succeed" = tener éxito (formal). NO siempre intercambiables.
Examples:
1. The investment paid off. (no separable: dar resultado) | ES: La inversión dio resultado.
2. She paid off her debt. / She paid her debt off. / She paid it off. (⚠️ "it" en medio) | ES: Ella pagó su deuda.
3. Hard work pays off. (no separable) | ES: El esfuerzo da resultado.
4. He paid off the loan. / He paid the loan off. / He paid it off. | ES: Él pagó el préstamo.'),
    ('Phrasal Verbs - Dinero y compras', 'Inseparable', 'Splash out', 'Derrochar', 'She splashed out on a dress. (⚠️ "it": splashed out on it ✅ / splashed it out on ❌) (ES: Ella gastó mucho en un vestido.)', 'Related: Spend lavishly
Context: Contexto diferente: "Splash out" = derrochar (UK, informal). "Spend lavishly" = gastar mucho (formal). Intercambiables pero "splash out" es más coloquial.
Examples:
1. She splashed out on a dress. (⚠️ "it": splashed out on it ✅ / splashed it out on ❌) | ES: Ella gastó mucho en un vestido.
2. He splashed out on a new car. | ES: Él gastó mucho en un coche nuevo.
3. Don''t splash out too much. | ES: No gastes demasiado.
4. They splashed out for the wedding. | ES: Gastaron mucho para la boda.'),
    ('Phrasal Verbs - Dinero y compras', 'Inseparable', 'Cough up', 'Pagar (a regañadientes)', 'He finally coughed up the money. (⚠️ "it": coughed up the money ✅ / coughed the money up ❌ — ver nota) (ES: Finalmente pagó el dinero a regañadientes.)', 'Related: Pay reluctantly
Context: Contexto diferente: "Cough up" = pagar a regañadientes (informal). "Pay reluctantly" = formal. Intercambiables pero "cough up" es más coloquial.
Note: NOTA: "Cough up" es inseparable en la práctica (el objeto va después). No se dice cough the money up con la misma naturalidad.
Examples:
1. He finally coughed up the money. (⚠️ "it": coughed up the money ✅ / coughed the money up ❌ — ver nota) | ES: Finalmente pagó el dinero a regañadientes.
2. Cough up the cash! | ES: ¡Suelta el dinero!
3. She coughed up for the tickets. | ES: Ella pagó las entradas a regañadientes.
4. He coughed up $100. | ES: Pagó 100 dólares a regañadientes.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Rip off', 'Estafar', 'They ripped me off! (⚠️ "me" en medio) / They ripped off me ❌ (ES: ¡Me estafaron!)', 'Related: Overcharge / Cheat
Context: Contexto diferente: "Rip off" = estafar (informal). "Overcharge" = cobrar de más (formal). "Cheat" = engañar (formal). Intercambiables pero "rip off" es más común.
Examples:
1. They ripped me off! (⚠️ "me" en medio) / They ripped off me ❌ | ES: ¡Me estafaron!
2. That store rips people off. / That store rips off people. | ES: Esa tienda estafa a la gente.
3. Don''t rip me off. (⚠️ "me" en medio) | ES: No me estafes.
4. We got ripped off. | ES: Nos estafaron.'),
    ('Phrasal Verbs - Dinero y compras', 'Separable', 'Settle up', 'Saldar cuentas', 'Let''s settle up the bill. / Let''s settle the bill up. / Let''s settle it up. (⚠️ "it" en medio) (ES: Saldemos la cuenta.)', 'Related: Pay / Settle
Context: Contexto diferente: "Settle up" = saldar cuentas (informal). "Pay" = pagar (general). "Settle" = saldar (formal). Intercambiables pero "settle up" es más específico.
Examples:
1. Let''s settle up the bill. / Let''s settle the bill up. / Let''s settle it up. (⚠️ "it" en medio) | ES: Saldemos la cuenta.
2. I need to settle up with you. | ES: Tengo que saldar cuentas contigo.
3. We settled up at the end. | ES: Saldamos las cuentas al final.
4. Settle up before you leave. | ES: Saldad las cuentas antes de iros.'),
    ('Phrasal Verbs - Dinero y compras', 'Inseparable', 'Fork out', 'Pagar', 'I had to fork out $100. (⚠️ "it": forked out for it ✅) (ES: Tuve que desembolsar 100 dólares.)', 'Related: Pay
Context: Contexto diferente: "Fork out" = pagar (UK, informal). "Pay" = pagar (general). Intercambiables pero "fork out" es más coloquial.
Examples:
1. I had to fork out $100. (⚠️ "it": forked out for it ✅) | ES: Tuve que desembolsar 100 dólares.
2. She forked out for the repairs. | ES: Ella desembolsó dinero para las reparaciones.
3. He forked out a lot of money. | ES: Él desembolsó mucho dinero.
4. Fork out the cash! | ES: ¡Desembolsa el dinero!'),
    ('Phrasal Verbs - Trabajo y estudio', 'Inseparable', 'Keep on', 'Continuar / Seguir', 'Keep on walking. (ES: Sigue caminando.)', 'Related: Continue / Go on
Context: Contexto diferente: "Keep on" = continuar (informal). "Continue" = continuar (formal). "Go on" = continuar (informal). Intercambiables pero "keep on" implica persistencia.
Examples:
1. Keep on walking. | ES: Sigue caminando.
2. She kept on talking. | ES: Ella siguió hablando.
3. He keeps on making mistakes. | ES: Él sigue cometiendo errores.
4. Keep on going! | ES: ¡Sigue adelante!'),
    ('Phrasal Verbs - Trabajo y estudio', 'Inseparable', 'Go on', 'Continuar / Suceder', 'Please go on with your story. (ES: Por favor, continúa con tu historia.)', 'Related: Continue / Happen
Context: Contexto diferente: "Go on" = continuar o suceder (informal). "Continue" = continuar (formal). "Happen" = suceder (formal). NO siempre intercambiables.
Examples:
1. Please go on with your story. | ES: Por favor, continúa con tu historia.
2. What''s going on here? | ES: ¿Qué está pasando aquí?
3. The show goes on. | ES: El espectáculo continúa.
4. She went on about her problems. | ES: Ella no paraba de hablar de sus problemas.'),
    ('Phrasal Verbs - Trabajo y estudio', 'Inseparable', 'Carry on', 'Continuar', 'Carry on with your work. (ES: Continúa con tu trabajo.)', 'Related: Continue / Go on
Context: Contexto diferente: "Carry on" = continuar (UK, informal). "Continue" = continuar (formal). "Go on" = continuar (informal). Intercambiables pero "carry on" es más UK.
Examples:
1. Carry on with your work. | ES: Continúa con tu trabajo.
2. She carried on singing. | ES: Ella siguió cantando.
3. We must carry on. | ES: Debemos continuar.
4. The tradition carries on. | ES: La tradición continúa.'),
    ('Phrasal Verbs - Trabajo y estudio', 'Inseparable', 'Hold on', 'Esperar / Agarrarse fuerte', 'Hold on a second. (ES: Espera un segundo.)', 'Related: Wait / Grasp
Context: Contexto diferente: "Hold on" = esperar (informal) o agarrarse fuerte. "Wait" = esperar (formal). "Grasp" = agarrar (formal). NO siempre intercambiables.
Examples:
1. Hold on a second. | ES: Espera un segundo.
2. Hold on to the railing. (⚠️ "it": hold on to it ✅ / hold it on to ❌) | ES: Agárrate de la barandilla.
3. She held on to her photos. | ES: Ella se aferró a sus fotos.
4. Hold on, I''m coming! | ES: ¡Espera, ya voy!'),
    ('Phrasal Verbs - Trabajo y estudio', 'Inseparable', 'Run out of', 'Quedarse sin', 'We ran out of milk. (⚠️ "it": ran out of it ✅ / ran it out of ❌) (ES: Nos quedamos sin leche.)', 'Related: Deplete / Exhaust
Context: Contexto diferente: "Run out of" = quedarse sin (informal). "Deplete" = agotar (formal). "Exhaust" = agotar (formal). Intercambiables pero "run out of" es más común.
Examples:
1. We ran out of milk. (⚠️ "it": ran out of it ✅ / ran it out of ❌) | ES: Nos quedamos sin leche.
2. I ran out of money. | ES: Me quedé sin dinero.
3. She ran out of patience. | ES: Ella se quedó sin paciencia.
4. Time is running out. | ES: Se nos acaba el tiempo.'),
    ('Idioms', 'Idiom', 'Go the extra mile', 'Hacer un esfuerzo adicional / Ir más allá', 'She went the extra mile to help her students. (ES: Hizo un esfuerzo adicional para ayudar a sus alumnos.)', 'Meaning: Make more effort than expected to achieve something or help someone.
Related: Go above and beyond.
Examples:
1. She went the extra mile to help her students. (Hizo un esfuerzo adicional para ayudar a sus alumnos.)
2. Our team always goes the extra mile for customers. (Nuestro equipo siempre hace un esfuerzo extra por los clientes.)
3. He went the extra mile to finish the project on time. (Hizo un esfuerzo adicional para terminar el proyecto a tiempo.)
4. You do not have to go the extra mile every single day. (No tienes que esforzarte de más todos los días.)'),
    ('Idioms', 'Idiom', 'Think outside the box', 'Pensar de forma creativa / Pensar fuera de lo convencional', 'We need to think outside the box to solve this problem. (ES: Necesitamos pensar de forma creativa para resolver este problema.)', 'Meaning: Think creatively and consider ideas that are not conventional.
Related: Think creatively.
Examples:
1. We need to think outside the box to solve this problem. (Necesitamos pensar de forma creativa para resolver este problema.)
2. She thought outside the box and found a cheaper solution. (Pensó de forma original y encontró una solución más económica.)
3. The teacher encouraged us to think outside the box. (El profesor nos animó a pensar de manera creativa.)
4. Thinking outside the box helped the company attract new customers. (Pensar de forma innovadora ayudó a la empresa a atraer nuevos clientes.)'),
    ('Idioms', 'Idiom', 'Cut corners', 'Tomar atajos / Hacer algo de forma descuidada para ahorrar tiempo o dinero', 'If we cut corners on safety, someone could get hurt. (ES: Si escatimamos en seguridad, alguien podría salir lastimado.)', 'Meaning: Do something in the easiest or cheapest way, often sacrificing quality or safety.
Related: Take shortcuts.
Examples:
1. If we cut corners on safety, someone could get hurt. (Si escatimamos en seguridad, alguien podría salir lastimado.)
2. They cut corners to finish the job faster. (Tomaron atajos para terminar el trabajo más rápido.)
3. Do not cut corners when you prepare this recipe. (No hagas las cosas a medias al preparar esta receta.)
4. The builder cut corners, so the repairs did not last. (El constructor escatimó en materiales y las reparaciones no duraron.)'),
    ('Idioms', 'Idiom', 'In the loop', 'Al tanto / Informado', 'Please keep me in the loop about any changes. (ES: Por favor, mantenme al tanto de cualquier cambio.)', 'Meaning: Informed about what is happening, especially in a group or project. Commonly used as "keep someone in the loop".
Related: Keep someone informed.
Examples:
1. Please keep me in the loop about any changes. (Por favor, mantenme al tanto de cualquier cambio.)
2. I was out of the loop while I was on vacation. (No estuve al tanto mientras estaba de vacaciones.)
3. Make sure the whole team is in the loop. (Asegúrate de que todo el equipo esté informado.)
4. She kept us in the loop throughout the project. (Nos mantuvo informados durante todo el proyecto.)'),
    ('Idioms', 'Idiom', 'Win-win situation', 'Situación beneficiosa para ambas partes', 'The agreement created a win-win situation for both companies. (ES: El acuerdo creó una situación beneficiosa para ambas empresas.)', 'Meaning: A situation in which everyone involved benefits.
Related: Mutually beneficial arrangement.
Examples:
1. The agreement created a win-win situation for both companies. (El acuerdo creó una situación beneficiosa para ambas empresas.)
2. Sharing the work was a win-win situation for us. (Repartir el trabajo fue beneficioso para todos nosotros.)
3. Flexible hours can be a win-win situation for employees and managers. (Los horarios flexibles pueden beneficiar tanto a empleados como a gerentes.)
4. We found a win-win solution to the problem. (Encontramos una solución que nos beneficia a todos.)'),
    ('Idioms', 'Idiom', 'Face-to-face', 'Cara a cara / En persona', 'We discussed the issue face-to-face. (ES: Hablamos del asunto cara a cara.)', 'Meaning: In person, with people physically present together; it can also describe direct communication.
Related: In person.
Examples:
1. We discussed the issue face-to-face. (Hablamos del asunto cara a cara.)
2. I prefer face-to-face meetings. (Prefiero las reuniones en persona.)
3. They finally met face-to-face after months of emails. (Por fin se conocieron en persona después de meses de correos.)
4. Face-to-face communication can prevent misunderstandings. (La comunicación cara a cara puede evitar malentendidos.)'),
    ('Idioms', 'Idiom', 'Keep in mind', 'Tener en cuenta / Recordar', 'Keep in mind that the store closes at six. (ES: Ten en cuenta que la tienda cierra a las seis.)', 'Meaning: Remember or consider a fact when making a decision.
Related: Bear in mind; remember.
Examples:
1. Keep in mind that the store closes at six. (Ten en cuenta que la tienda cierra a las seis.)
2. Keep this deadline in mind when you plan your week. (Ten presente esta fecha límite al planear tu semana.)
3. We should keep in mind how much the repairs will cost. (Deberíamos tener en cuenta cuánto costarán las reparaciones.)
4. I will keep your suggestion in mind. (Tendré en cuenta tu sugerencia.)'),
    ('Idioms', 'Idiom', 'Up to speed', 'Al día / Bien informado o actualizado', 'The new employee is getting up to speed with the software. (ES: El nuevo empleado se está familiarizando con el programa.)', 'Meaning: Informed about the latest facts or able to work effectively after learning what is needed. Commonly used as "bring/get someone up to speed".
Related: Up to date; informed.
Examples:
1. The new employee is getting up to speed with the software. (El nuevo empleado se está familiarizando con el programa.)
2. Can you bring me up to speed on the latest changes? (¿Puedes ponerme al día sobre los últimos cambios?)
3. It took a week to get up to speed in my new role. (Me tomó una semana ponerme al día en mi nuevo puesto.)
4. The report will bring everyone up to speed. (El informe pondrá a todos al corriente.)'),
    ('Idioms', 'Idiom', 'On top of things', 'Tener todo bajo control / Estar al tanto', 'She is always on top of things at work. (ES: Siempre tiene todo bajo control en el trabajo.)', 'Meaning: Organized, in control of tasks, and aware of what needs to be done.
Related: On top of it; in control.
Examples:
1. She is always on top of things at work. (Siempre tiene todo bajo control en el trabajo.)
2. I made a list to stay on top of things. (Hice una lista para mantener todo bajo control.)
3. He is on top of things, so the project is running smoothly. (Él tiene todo organizado, así que el proyecto avanza sin problemas.)
4. I have been busy, but I am finally back on top of things. (He estado ocupado, pero por fin vuelvo a tener todo bajo control.)'),
    ('Idioms', 'Idiom', 'Take it easy', 'Tomárselo con calma / Relajarse', 'You have been working all day; take it easy tonight. (ES: Has trabajado todo el día; tómatelo con calma esta noche.)', 'Meaning: Relax or avoid doing too much; it can also be used informally when saying goodbye.
Related: Relax; slow down.
Examples:
1. You have been working all day; take it easy tonight. (Has trabajado todo el día; tómatelo con calma esta noche.)
2. Take it easy and get some rest. (Relájate y descansa un poco.)
3. The doctor told him to take it easy for a few days. (El médico le dijo que se lo tomara con calma durante unos días.)
4. I have to go now. Take it easy! (Me tengo que ir. ¡Cuídate!)'),
    ('Idioms', 'Idiom', 'The bottom line', 'Lo más importante / La conclusión / El resultado final', 'The bottom line is that we need more time. (ES: En definitiva, necesitamos más tiempo.)', 'Meaning: The most important fact or final result; in business, it can also refer to profit or loss.
Related: The main point; the conclusion.
Examples:
1. The bottom line is that we need more time. (En definitiva, necesitamos más tiempo.)
2. The bottom line is simple: safety comes first. (Lo más importante es sencillo: la seguridad es lo primero.)
3. We need to improve our bottom line this year. (Necesitamos mejorar nuestras ganancias netas este año.)
4. After all the discussion, that was the bottom line. (Después de toda la conversación, esa fue la conclusión.)'),
    ('Idioms', 'Idiom', 'Out of the box', 'Listo para usar / Innovador y poco convencional', 'The device works right out of the box. (ES: El dispositivo funciona nada más sacarlo de la caja.)', 'Meaning: Usually ready to use immediately without extra setup; when describing thinking, it means unconventional or creative. The meaning depends on context.
Related: Ready-made; unconventional.
Examples:
1. The device works right out of the box. (El dispositivo funciona nada más sacarlo de la caja.)
2. This software is easy to use out of the box. (Este programa es fácil de usar desde el primer momento.)
3. We need an out-of-the-box solution. (Necesitamos una solución innovadora y poco convencional.)
4. Her out-of-the-box thinking helped the team. (Su forma original de pensar ayudó al equipo.)'),
    ('Idioms', 'Idiom', 'On the same page', 'Estar de acuerdo / Entender lo mismo', 'Let us review the plan so we are all on the same page. (ES: Revisemos el plan para que todos estemos de acuerdo.)', 'Meaning: Share the same understanding, expectations, or opinion.
Related: Be in agreement; see eye to eye.
Examples:
1. Let us review the plan so we are all on the same page. (Revisemos el plan para que todos estemos de acuerdo.)
2. Before we start, make sure we are on the same page. (Antes de empezar, asegúrate de que entendemos lo mismo.)
3. The two teams are finally on the same page. (Por fin los dos equipos están de acuerdo.)
4. I thought we were on the same page about the deadline. (Pensé que estábamos de acuerdo sobre la fecha límite.)'),
    ('Idioms', 'Idiom', 'Piece of cake', 'Pan comido / Muy fácil', 'The test was a piece of cake. (ES: El examen fue pan comido.)', 'Meaning: Something that is very easy to do.
Related: Easy as pie; a breeze.
Examples:
1. The test was a piece of cake. (El examen fue pan comido.)
2. Setting up the account was a piece of cake. (Configurar la cuenta fue muy fácil.)
3. The recipe looks difficult, but it is a piece of cake. (La receta parece difícil, pero es facilísima.)
4. Do not worry about the presentation; it will be a piece of cake. (No te preocupes por la presentación; será pan comido.)'),
    ('Idioms', 'Idiom', 'Break a leg', '¡Mucha suerte!', 'You have a big audition tomorrow. Break a leg! (ES: Mañana tienes una audición importante. ¡Mucha suerte!)', 'Meaning: An informal expression used to wish someone good luck, especially before a performance.
Related: Good luck; knock them dead.
Examples:
1. You have a big audition tomorrow. Break a leg! (Mañana tienes una audición importante. ¡Mucha suerte!)
2. The whole cast said, "Break a leg!" before the show. (Todo el elenco dijo «¡Mucha suerte!» antes de la función.)
3. Break a leg in your presentation today. (¡Mucha suerte en tu presentación de hoy!)
4. She told her brother to break a leg before the competition. (Le deseó mucha suerte a su hermano antes de la competencia.)')
),
updated as (
    update public.verbs existing
    set category = source.category,
        type = source.type,
        translation = source.translation,
        example_base = source.example_base,
        usage = source.usage
    from source
    where lower(trim(existing.verb)) = lower(trim(source.verb))
      and existing.category = source.category
    returning existing.id
),
inserted as (
    insert into public.verbs (category, type, verb, translation, example_base, usage)
    select source.category, source.type, source.verb, source.translation, source.example_base, source.usage
    from source
    where not exists (
        select 1
        from public.verbs existing
        where lower(trim(existing.verb)) = lower(trim(source.verb))
    )
    returning id
)
select
    (select count(*) from updated) as updated_verbs,
    (select count(*) from inserted) as inserted_verbs;

commit;
