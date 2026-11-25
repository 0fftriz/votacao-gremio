// ==================================================
// 1. CONFIGURAÇÃO
// ==================================================

const SUPABASE_URL = "https://gppyapzkjdlyyunfruun.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZdG3O5XnFdP3m4NKTnqgkw_WOSARLWy";

const banco = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


// Som de confirmação da urna eletrônica
const somUrna = new Audio(
    "https://www.myinstants.com/media/sounds/confirma-urna.mp3"
);

function tocarSomUrna() {
    somUrna.currentTime = 0;

    somUrna.play().catch(erro => {
        console.error("Erro ao reproduzir o som:", erro);
    });
}




// Identificador persistente deste perfil do navegador.
// Ele não é uma prova criptográfica da identidade física
// do computador.
function obterDeviceId() {
    let id = localStorage.getItem("urna_device_id");

    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("urna_device_id", id);
    }

    return id;
}

const deviceId = obterDeviceId();

let tokenSessao = localStorage.getItem("urna_session_token");
let raAtual = "";
let digitos = "";
let escolhaAtual = null;
let enviando = false;


// ==================================================
// 2. ELEMENTOS
// ==================================================

const emailAdmin = document.getElementById("emailAdmin");
const senhaAdmin = document.getElementById("senhaAdmin");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const mensagemAdmin = document.getElementById("mensagemAdmin");
const controlesAdmin = document.getElementById("controlesAdmin");
const estadoAdmin = document.getElementById("estadoAdmin");
const btnIniciarUrna = document.getElementById("btnIniciarUrna");
const btnEncerrar = document.getElementById("btnEncerrar");

const abaVotacao = document.getElementById("abaVotacao");
const abaResultados = document.getElementById("abaResultados");
const telaVotacao = document.getElementById("telaVotacao");
const telaResultados = document.getElementById("telaResultados");

const urnaBloqueada = document.getElementById("urnaBloqueada");
const urnaAtiva = document.getElementById("urnaAtiva");
const telaIdentificacao = document.getElementById("telaIdentificacao");
const telaUrna = document.getElementById("telaUrna");
const telaFinal = document.getElementById("telaFinal");

const campoRA = document.getElementById("campoRA");
const btnIniciarVoto = document.getElementById("btnIniciarVoto");
const mensagemIdentificacao =
    document.getElementById("mensagemIdentificacao");

const numeroDigitado = document.getElementById("numeroDigitado");
const nomeChapa = document.getElementById("nomeChapa");
const detalhesChapa = document.getElementById("detalhesChapa");
const mensagemVoto = document.getElementById("mensagemVoto");

const btnBranco = document.getElementById("btnBranco");
const btnCorrige = document.getElementById("btnCorrige");
const btnConfirma = document.getElementById("btnConfirma");
const btnProximo = document.getElementById("btnProximo");
const btnOutroEleitor = document.getElementById("btnOutroEleitor");


const listaChapasPublicas =
    document.getElementById("listaChapasPublicas");

const btnConsultarResultados =
    document.getElementById("btnConsultarResultados");
const mensagemResultados =
    document.getElementById("mensagemResultados");
const painelResultados =
    document.getElementById("painelResultados");
const totalVotos = document.getElementById("totalVotos");
const totalBrancos = document.getElementById("totalBrancos");
const listaResultados = document.getElementById("listaResultados");


// ==================================================
// 3. MENSAGENS
// ==================================================

function mensagem(elemento, texto, tipo = "") {
    elemento.textContent = texto;
    elemento.style.color =
        tipo === "erro" ? "#b42318" :
        tipo === "sucesso" ? "#217346" : "";
}


// ==================================================
// 4. NAVEGAÇÃO
// ==================================================

function abrirAba(nome) {
    const votacao = nome === "votacao";

    telaVotacao.hidden = !votacao;
    telaResultados.hidden = votacao;

    abaVotacao.classList.toggle("ativa", votacao);
    abaResultados.classList.toggle("ativa", !votacao);
}

abaVotacao.addEventListener("click", () => abrirAba("votacao"));
abaResultados.addEventListener("click", () => abrirAba("resultados"));


// ==================================================
// 5. AUTENTICAÇÃO ADMINISTRATIVA
// ==================================================

btnLogin.addEventListener("click", entrarAdmin);

async function entrarAdmin() {
    mensagem(mensagemAdmin, "");

    const email = emailAdmin.value.trim();
    const senha = senhaAdmin.value;

    if (!email || !senha) {
        mensagem(mensagemAdmin, "Informe o e-mail e a senha.", "erro");
        return;
    }

    btnLogin.disabled = true;

    try {
        const { error } = await banco.auth.signInWithPassword({
            email,
            password: senha
        });

        if (error) {
            mensagem(
                mensagemAdmin,
                "Não foi possível entrar. Confira os dados.",
                "erro"
            );
            return;
        }

        senhaAdmin.value = "";
        await atualizarAutenticacao();
        mensagem(
            mensagemAdmin,
            "Administrador autenticado.",
            "sucesso"
        );
    } finally {
        btnLogin.disabled = false;
    }
}

btnLogout.addEventListener("click", async () => {
    await banco.auth.signOut();

    tokenSessao = null;
    localStorage.removeItem("urna_session_token");

    atualizarUrna(false);
    await atualizarAutenticacao();

    mensagem(mensagemAdmin, "Sessão administrativa encerrada.");
});

async function atualizarAutenticacao() {
    const { data } = await banco.auth.getSession();
    const autenticado = Boolean(data.session);

    btnLogin.hidden = autenticado;
    btnLogout.hidden = !autenticado;
    emailAdmin.disabled = autenticado;
    senhaAdmin.disabled = autenticado;
    controlesAdmin.hidden = !autenticado;

    if (!autenticado) {
        estadoAdmin.textContent = "Administrador não autenticado.";
        atualizarUrna(false);
        return;
    }

    estadoAdmin.textContent =
        "Administrador autenticado. A urna ainda pode estar bloqueada.";

    await verificarSessaoSalva();
}

banco.auth.onAuthStateChange(() => {
    // Evita fazer chamadas demoradas dentro do callback de autenticação.
    setTimeout(() => atualizarAutenticacao(), 0);
});


// ==================================================
// 6. ABRIR A SESSÃO DA URNA
// ==================================================

btnIniciarUrna.addEventListener("click", iniciarUrna);

async function iniciarUrna() {
    btnIniciarUrna.disabled = true;

    try {
        const { data, error } = await banco.rpc(
            "abrir_sessao_urna",
            { p_device_id: deviceId }
        );

        if (error) {
            mensagem(mensagemAdmin, error.message, "erro");
            return;
        }

        tokenSessao = data;
        localStorage.setItem("urna_session_token", tokenSessao);

        const valida = await validarSessao();

        if (!valida) {
            tokenSessao = null;
            localStorage.removeItem("urna_session_token");
            atualizarUrna(false);

            mensagem(
                mensagemAdmin,
                "Não foi possível validar a sessão da urna.",
                "erro"
            );

            return;
        }

        atualizarUrna(true);

        mensagem(
            mensagemAdmin,
            "Urna autorizada neste perfil do navegador.",
            "sucesso"
        );

        estadoAdmin.textContent =
            "Sessão de urna ativa neste perfil do navegador.";
    } finally {
        btnIniciarUrna.disabled = false;
    }
}


// ==================================================
// 7. VALIDAR A SESSÃO SALVA
// ==================================================

async function validarSessao() {
    if (!tokenSessao) {
        return false;
    }

    const { data, error } = await banco.rpc(
        "validar_sessao_urna",
        {
            p_device_id: deviceId,
            p_session_token: tokenSessao
        }
    );

    if (error) {
        console.error(error);
        return false;
    }

    return data === true;
}

async function verificarSessaoSalva() {
    const valida = await validarSessao();
    atualizarUrna(valida);

    if (!valida) {
        tokenSessao = null;
        localStorage.removeItem("urna_session_token");
    }
}

function atualizarUrna(ativa) {
    urnaBloqueada.hidden = ativa;
    urnaAtiva.hidden = !ativa;

    if (!ativa) {
        telaIdentificacao.hidden = false;
        telaUrna.hidden = true;
        telaFinal.hidden = true;
    }
}


// ==================================================
// 8. ENCERRAR A ELEIÇÃO
// ==================================================

btnEncerrar.addEventListener("click", encerrarVotacao);

async function encerrarVotacao() {
    if (!tokenSessao) {
        mensagem(
            mensagemAdmin,
            "Não existe sessão ativa neste navegador.",
            "erro"
        );
        return;
    }

    const confirmar = window.confirm(
        "Deseja realmente encerrar a eleição? " +
        "Essa operação bloqueará novos votos e liberará a apuração."
    );

    if (!confirmar) {
        return;
    }

    btnEncerrar.disabled = true;

    try {
        const { error } = await banco.rpc(
            "encerrar_votacao",
            {
                p_device_id: deviceId,
                p_session_token: tokenSessao
            }
        );

        if (error) {
            mensagem(mensagemAdmin, error.message, "erro");
            return;
        }

        tokenSessao = null;
        localStorage.removeItem("urna_session_token");

        atualizarUrna(false);

        mensagem(
            mensagemAdmin,
            "Eleição encerrada. A apuração está disponível.",
            "sucesso"
        );

        estadoAdmin.textContent = "Eleição encerrada.";
    } finally {
        btnEncerrar.disabled = false;
    }
}


// ==================================================
// 9. CONSULTAR AS CHAPAS PÚBLICAS
// ==================================================

async function carregarChapasPublicas() {
    const { data, error } = await banco
        .from("chapas")
        .select("numero, nome, integrantes, propostas")
        .eq("ativa", true)
        .order("numero");

    listaChapasPublicas.replaceChildren();

    if (error) {
        mensagem(
            listaChapasPublicas,
            "Não foi possível carregar as chapas."
        );
        return;
    }

    data.forEach((chapa) => {
        const item = document.createElement("article");
        item.className = "resultado-item";

        const titulo = document.createElement("h3");
        titulo.textContent =
            "Chapa " + chapa.numero + " — " + chapa.nome;

        const integrantes = document.createElement("p");
        integrantes.textContent =
            "Integrantes: " + (chapa.integrantes || "Não informado");

        const propostas = document.createElement("p");
        propostas.textContent =
            "Propostas: " + (chapa.propostas || "Não informadas");

        item.append(titulo, integrantes, propostas);
        listaChapasPublicas.appendChild(item);
    });
}


// ==================================================
// 10. INICIAR O VOTO
// ==================================================

btnIniciarVoto.addEventListener("click", iniciarVoto);

function iniciarVoto() {
    const ra = campoRA.value.trim();

    if (!ra) {
        mensagem(
            mensagemIdentificacao,
            "Informe o RA do eleitor.",
            "erro"
        );
        return;
    }

    raAtual = ra;

    telaIdentificacao.hidden = true;
    telaUrna.hidden = false;
    telaFinal.hidden = true;	
    btnOutroEleitor.hidden = true;

    limparEscolha();
}


// ==================================================
// 11. TECLADO E ESCOLHA
// ==================================================

document.querySelectorAll("[data-numero]").forEach((botao) => {
    botao.addEventListener("click", () => {
        adicionarDigito(botao.dataset.numero);
    });
});

function adicionarDigito(numero) {
    if (enviando || telaUrna.hidden) return;

    if (escolhaAtual === "branco") {
        limparEscolha();
    }

    if (digitos.length >= 2) return;

    digitos += numero;
    numeroDigitado.textContent = digitos.padEnd(2, "_");

    escolhaAtual = null;
    nomeChapa.textContent = "Consultando chapa...";
    detalhesChapa.textContent = "";

    if (digitos.length === 2) {
        consultarChapa();
    }
}

async function consultarChapa() {
    const numero = Number(digitos);

    const { data, error } = await banco
        .from("chapas")
        .select("numero, nome, integrantes, propostas")
        .eq("numero", numero)
        .eq("ativa", true)
        .maybeSingle();

    if (error || !data) {
        escolhaAtual = null;
        nomeChapa.textContent = "Chapa não encontrada";

        mensagem(
            mensagemVoto,
            "Verifique o número e tente novamente.",
            "erro"
        );

        return;
    }

    escolhaAtual = data.numero;
    nomeChapa.textContent = data.nome;

    detalhesChapa.textContent =
        "Integrantes: " + (data.integrantes || "Não informado") +
        "\nPropostas: " + (data.propostas || "Não informadas");

    mensagem(
        mensagemVoto,
        "Confira os dados e pressione CONFIRMA.",
        "sucesso"
    );
}

function limparEscolha() {
    digitos = "";
    escolhaAtual = null;

    numeroDigitado.textContent = "__";
    nomeChapa.textContent = "Aguardando escolha";
    detalhesChapa.textContent = "";

    mensagem(mensagemVoto, "");
}

btnBranco.addEventListener("click", () => {
    if (enviando) return;

    digitos = "";
    escolhaAtual = "branco";

    numeroDigitado.textContent = "__";
    nomeChapa.textContent = "VOTO EM BRANCO";
    detalhesChapa.textContent = "";

    mensagem(
        mensagemVoto,
        "Voto em branco selecionado. Pressione CONFIRMA.",
        "sucesso"
    );
});

btnCorrige.addEventListener("click", () => {
    if (!enviando) limparEscolha();
});


// ==================================================
// 12. SOM DE CONFIRMAÇÃO
// ==================================================

function emitirSom() {
    try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioClass) return;

        const contexto = new AudioClass();
        const oscilador = contexto.createOscillator();
        const ganho = contexto.createGain();

        oscilador.frequency.value = 880;
        ganho.gain.value = 0.12;

        oscilador.connect(ganho);
        ganho.connect(contexto.destination);

        oscilador.start();
        oscilador.stop(contexto.currentTime + 0.22);

        oscilador.onended = () => contexto.close();
    } catch (erro) {
        console.error(erro);
    }
}


// ==================================================
// 13. CONFIRMAR O VOTO
// ==================================================

btnConfirma.addEventListener("click", confirmarVoto);

async function confirmarVoto() {
    if (enviando) return;

    if (escolhaAtual === null) {
        mensagem(
            mensagemVoto,
            "Escolha uma chapa válida ou vote em branco.",
            "erro"
        );
        return;
    }

    const escolha = escolhaAtual;
    const numeroChapa =
        escolha === "branco" ? null : Number(escolha);

    enviando = true;
    btnConfirma.disabled = true;

    try {
        // Revalida a sessão antes de tentar registrar.
        const valida = await validarSessao();

        if (!valida) {
            atualizarUrna(false);

            mensagem(
                mensagemVoto,
                "A sessão da urna não está mais autorizada.",
                "erro"
            );
            return;
        }

        const { error } = await banco.rpc(
            "registrar_voto",
            {
                p_ra: raAtual,
                p_numero_chapa: numeroChapa,
                p_device_id: deviceId,
                p_session_token: tokenSessao
            }
        );

        if (error) {
            mensagem(
                mensagemVoto,
                "O voto não foi confirmado. " +
                "Verifique o RA e procure o responsável se necessário.",
                "erro"
            );
            btnOutroEleitor.hidden = false;
            return;
        }

        tocarSomUrna();

        telaUrna.hidden = true;
        telaFinal.hidden = false;
    } finally {
        enviando = false;
        btnConfirma.disabled = false;
    }
}

// ==========================================
// VOLTAR PARA IDENTIFICAÇÃO / OUTRO ELEITOR
// ==========================================

btnOutroEleitor.addEventListener("click", () => {

  // Limpa os dados do eleitor atual
  raAtual = "";
  campoRA.value = "";

  // Limpa a escolha da chapa
  limparEscolha();

  // Limpa as mensagens
  mensagem(mensagemIdentificacao, "");
  mensagem(mensagemVoto, "");

  // Retorna para a identificação
  telaUrna.hidden = true;
  telaFinal.hidden = true;
  telaIdentificacao.hidden = false;

  // Esconde novamente o botão
  btnOutroEleitor.hidden = true;

  // Posiciona o cursor no campo RA
  campoRA.focus();

});



// ==================================================
// 14. PRÓXIMO ELEITOR
// ==================================================

btnProximo.addEventListener("click", () => {
    raAtual = "";
    campoRA.value = "";

    telaFinal.hidden = true;
    telaUrna.hidden = true;
    telaIdentificacao.hidden = false;

    limparEscolha();
    campoRA.focus();
});


// ==================================================
// 15. TECLADO FÍSICO
// ==================================================

document.addEventListener("keydown", (evento) => {
    if (telaVotacao.hidden) return;
    if (telaUrna.hidden) return;
    if (document.activeElement === campoRA) return;

    if (/^[0-9]$/.test(evento.key)) {
        adicionarDigito(evento.key);
    }

    if (evento.key === "Backspace") {
        limparEscolha();
    }

    if (evento.key === "Enter") {
        confirmarVoto();
    }
});


// ==================================================
// 16. CONSULTAR RESULTADOS
// ==================================================

btnConsultarResultados.addEventListener(
    "click",
    carregarResultados
);

async function carregarResultados() {
    painelResultados.hidden = true;
    listaResultados.replaceChildren();

    mensagem(mensagemResultados, "Consultando resultados...");

    const { data, error } = await banco.rpc("consultar_resultados");

    if (error) {
        mensagem(
            mensagemResultados,
            "A apuração ainda não está disponível. " +
            "Consulte novamente após o encerramento.",
            "erro"
        );
        return;
    }

    totalVotos.textContent =
        Number(data.total_votos).toLocaleString("pt-BR");

    totalBrancos.textContent =
        Number(data.votos_brancos).toLocaleString("pt-BR");

    data.chapas.forEach((chapa) => {
        criarResultado(
            "Chapa " + chapa.numero + " — " + chapa.nome,
            Number(chapa.votos),
            Number(chapa.percentual)
        );
    });

    criarResultado(
        "Votos em branco",
        Number(data.votos_brancos),
        Number(data.percentual_brancos)
    );

    painelResultados.hidden = false;

    mensagem(
        mensagemResultados,
        "Apuração carregada.",
        "sucesso"
    );
}

function criarResultado(titulo, quantidade, percentual) {
    const item = document.createElement("article");
    item.className = "resultado-item";

    const nome = document.createElement("h4");
    nome.textContent = titulo;

    const texto = document.createElement("p");
    texto.textContent =
        quantidade.toLocaleString("pt-BR") +
        " votos (" +
        percentual.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) +
        "%)";

    const fundo = document.createElement("div");
    fundo.className = "barra-fundo";

    const barra = document.createElement("div");
    barra.className = "barra-preenchida";

    barra.style.width =
        Math.max(0, Math.min(100, percentual)) + "%";

    fundo.appendChild(barra);
    item.append(nome, texto, fundo);

    listaResultados.appendChild(item);
}


// ==================================================
// 17. INICIALIZAÇÃO
// ==================================================

async function iniciarSistema() {
    await carregarChapasPublicas();
    await atualizarAutenticacao();
}

iniciarSistema();
