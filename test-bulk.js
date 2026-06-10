global.window = global;
global.API_BASE_URL = 'http://localhost:8080/api';
require('./js/utils/auth.js');

async function testBulk() {
    try {
        await window.auth.login('admin', 'admin1234');
        const token = window.auth.getToken();
        
        const payload = [
            { id: "1234567", nome: "Valid Aluno", tipo: "ALUNO", turma: "3A" },
            { id: "1234567", nome: "Dupe Aluno", tipo: "ALUNO", turma: "3B" },
            { id: "1234568", nome: "Invalid Type", tipo: "DIRETOR" },
            { id: "1234569", nome: "Phantom Resp", tipo: "ALUNO", turma: "3C", responsavelId: "R9999" },
            { id: "A0001", nome: "Bad ID", tipo: "ALUNO", turma: "3A" }
        ];

        const res = await fetch('http://localhost:8080/api/users/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch(e) {
        console.error("Test failed:", e);
    }
}

testBulk();
