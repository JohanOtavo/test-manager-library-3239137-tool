// Catálogo de demostración: 40 títulos repartidos entre las cinco categorías
// sembradas por la migración inicial (data-model §9).

export const CATEGORIES = {
  novela: '11111111-1111-4111-8111-111111111111',
  ciencia: '22222222-2222-4222-8222-222222222222',
  tecnologia: '33333333-3333-4333-8333-333333333333',
  historia: '44444444-4444-4444-8444-444444444444',
  infantil: '55555555-5555-4555-8555-555555555555',
}

export const BOOKS = [
  ['Cien años de soledad', 'Gabriel García Márquez', 'novela'],
  ['Rayuela', 'Julio Cortázar', 'novela'],
  ['Pedro Páramo', 'Juan Rulfo', 'novela'],
  ['La casa de los espíritus', 'Isabel Allende', 'novela'],
  ['El túnel', 'Ernesto Sabato', 'novela'],
  ['Ficciones', 'Jorge Luis Borges', 'novela'],
  ['La vorágine', 'José Eustasio Rivera', 'novela'],
  ['Delirio', 'Laura Restrepo', 'novela'],
  ['El amor en los tiempos del cólera', 'Gabriel García Márquez', 'novela'],
  ['Santa Evita', 'Tomás Eloy Martínez', 'novela'],
  ['Breve historia del tiempo', 'Stephen Hawking', 'ciencia'],
  ['El gen egoísta', 'Richard Dawkins', 'ciencia'],
  ['Cosmos', 'Carl Sagan', 'ciencia'],
  ['El origen de las especies', 'Charles Darwin', 'ciencia'],
  ['Física para curiosos', 'Jearl Walker', 'ciencia'],
  ['La doble hélice', 'James Watson', 'ciencia'],
  ['El mundo y sus demonios', 'Carl Sagan', 'ciencia'],
  ['Seis piezas fáciles', 'Richard Feynman', 'ciencia'],
  ['Código limpio', 'Robert C. Martin', 'tecnologia'],
  ['El programador pragmático', 'Andrew Hunt', 'tecnologia'],
  ['Refactorización', 'Martin Fowler', 'tecnologia'],
  ['Patrones de diseño', 'Erich Gamma', 'tecnologia'],
  ['Diseño guiado por el dominio', 'Eric Evans', 'tecnologia'],
  ['Arquitectura limpia', 'Robert C. Martin', 'tecnologia'],
  ['Trabajar con código heredado', 'Michael Feathers', 'tecnologia'],
  ['Entrega continua', 'Jez Humble', 'tecnologia'],
  ['Diseño de aplicaciones intensivas en datos', 'Martin Kleppmann', 'tecnologia'],
  ['Sapiens', 'Yuval Noah Harari', 'historia'],
  ['Armas, gérmenes y acero', 'Jared Diamond', 'historia'],
  ['Historia de Colombia', 'Jorge Orlando Melo', 'historia'],
  ['El siglo de las luces', 'Alejo Carpentier', 'historia'],
  ['Los hijos de los días', 'Eduardo Galeano', 'historia'],
  ['Las venas abiertas de América Latina', 'Eduardo Galeano', 'historia'],
  ['El principito', 'Antoine de Saint-Exupéry', 'infantil'],
  ['Cuentos de la selva', 'Horacio Quiroga', 'infantil'],
  ['Matilda', 'Roald Dahl', 'infantil'],
  ['Donde viven los monstruos', 'Maurice Sendak', 'infantil'],
  ['La vuelta al mundo en 80 días', 'Julio Verne', 'infantil'],
  ['Momo', 'Michael Ende', 'infantil'],
  ['El libro de la selva', 'Rudyard Kipling', 'infantil'],
]

export const MEMBERS = [
  ['Ana Lucía Pérez', '1098765432'],
  ['Carlos Andrés Gómez', '1020304050'],
  ['María Fernanda Ruiz', '1122334455'],
  ['Jorge Esteban Mora', '1033445566'],
  ['Laura Catalina Díaz', '1044556677'],
  ['Santiago Restrepo', '1055667788'],
  ['Valentina Ortiz', '1066778899'],
  ['Daniel Felipe Cano', '1077889900'],
  ['Juliana Álvarez', '1088990011'],
  ['Mateo Sebastián Rojas', '1099001122'],
]

/** ISBN de 13 dígitos válido para la demostración, derivado del índice. */
export function demoIsbn(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 999999999) {
    throw new RangeError('El índice del ISBN debe ser un entero entre 0 y 999999999.')
  }

  const body = `978${String(index).padStart(9, '0')}`
  const checksum = [...body].reduce((sum, digit, position) =>
    sum + Number(digit) * (position % 2 === 0 ? 1 : 3), 0)
  const checkDigit = (10 - (checksum % 10)) % 10

  return `${body}${checkDigit}`
}
