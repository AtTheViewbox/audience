export const Visibility = {
    AUTHENTICATED: "AUTHENTICATED",
    PUBLIC: "PUBLIC",
    PRIVATE: "PRIVATE",
  };

   
export const Filter = {
  ALL: "ALL",
  MYSTUDIES: "MYSTUDIES",
  PLAYLISTS: "PLAYLISTS",
  PACSBIN:"PACSBIN",
  BUILDER: "BUILDER",
}


const adjectives = [
  "Clever","Jolly","Swift","Bold","Curious","Radiant","Witty","Daring","Noble",
  "Breezy","Mighty","Silly","Brave","Sneaky","Glowing","Zany","Chill","Fierce",
  "Giggly","Lively","Sly","Cheery","Cosmic","Sunny","Swift"
];

const specialties = [
  "Cardiologist","Neurologist","Dermatologist","Pediatrician","Oncologist",
  "Psychiatrist","Surgeon","Radiologist","Dentist","Anesthesiologist",
  "Endocrinologist","Immunologist","Nephrologist","Ophthalmologist","Orthopedist",
  "Pathologist","Pulmonologist","Rheumatologist","Urologist","Gastroenterologist",
  "Otolaryngologist","Geriatrician","Hematologist","Obstetrician","Geneticist"
];

export function generateRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const spec = specialties[Math.floor(Math.random() * specialties.length)];
  const number = Math.floor(1000 + Math.random() * 9000); // adds uniqueness
  return `${adj} ${spec}`;
}