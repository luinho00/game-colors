document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN ---
    const CONFIG = {
        baseTimeLimit: 4000,
        timePerStep: 1200,
        colors: ['#FF0055', '#00E5FF', '#76FF03', '#FFD600', '#D500F9', '#FF9100', '#FFFFFF', '#333333', '#8800FF']
    };

    // --- VARIABLES DE ESTADO ---
    const STATE = { IDLE: 'idle', SHOWING: 'showing', INPUT: 'input', PAUSED: 'paused', GAMEOVER: 'gameover' };
    let currentState = STATE.IDLE;
    let previousState = STATE.IDLE;
    let sequence = [];
    let playerStep = 0;
    let level = 1;
    let score = 0;
    let currentGridSize = 2; // Empezamos en 2x2
    let audioCtx = null;
    let isSoundOn = true;
    let timerInterval = null;
    let timeRemaining = 0;
    let totalTimeForRound = 0;

    // --- REFERENCIAS DOM ---
    const gridContainer = document.getElementById('grid-container');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayMsg = document.getElementById('overlay-msg');
    
    // UI Récords
    const highscoreSection = document.getElementById('highscore-section');
    const leaderboardSection = document.getElementById('leaderboard-section');
    const playerNameInput = document.getElementById('player-name');
    const leaderboardList = document.getElementById('leaderboard-list');
    const btnSaveScore = document.getElementById('btn-save-score');
    const btnCloseScore = document.getElementById('btn-close-score');

    // Botones control
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');
    const btnSound = document.getElementById('btn-sound');
    const btnPause = document.getElementById('btn-pause');
    const levelDisplay = document.getElementById('level-display');
    const scoreDisplay = document.getElementById('score-display');
    const timerBar = document.getElementById('timer-bar');
    const bgMusic = document.getElementById('bg-music');

    // --- SISTEMA DE AUDIO ---
    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (isSoundOn && bgMusic) {
            bgMusic.volume = 0.3;
            bgMusic.play().catch(() => {});
        }
    }

    function toggleSound() {
        isSoundOn = !isSoundOn;
        btnSound.textContent = isSoundOn ? '🎵' : '🔇';
        btnSound.style.opacity = isSoundOn ? '1' : '0.5';
        if (bgMusic) isSoundOn ? bgMusic.play() : bgMusic.pause();
    }

    function playTone(freq, type = 'sine', duration = 0.15) {
        if (!isSoundOn || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // --- LÓGICA DE NIVELES (2x2 -> 6x6) ---
    function getGridSizeForLevel(lvl) {
        if (lvl <= 5) return 2;  // Niveles 1-5: 2x2
        if (lvl <= 10) return 3; // Niveles 6-10: 3x3
        if (lvl <= 15) return 4; // Niveles 11-15: 4x4
        if (lvl <= 20) return 5; // Niveles 16-20: 5x5
        return 6;                // Nivel 21+: 6x6
    }

    function createGrid(size) {
        gridContainer.innerHTML = '';
        currentGridSize = size;
        
        // CSS Grid dinámico
        gridContainer.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        gridContainer.style.gridTemplateRows = `repeat(${size}, 1fr)`;

        const totalCells = size * size;
        
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;
            cell.dataset.color = CONFIG.colors[i % CONFIG.colors.length]; 
            
            cell.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                handleInput(i, cell);
            });
            gridContainer.appendChild(cell);
        }
    }

    // --- JUEGO ---
    function startGame() {
        if (currentState === STATE.PAUSED) { togglePause(); return; }

        initAudio();
        sequence = [];
        level = 1;
        score = 0;
        updateStats();
        btnRestart.disabled = false;
        
        // Empezar con 2x2
        createGrid(2);
        
        overlay.classList.remove('visible');
        highscoreSection.classList.add('hidden');
        leaderboardSection.classList.add('hidden');
        overlayMsg.style.display = 'block';

        nextRound();
    }

    function nextRound() {
        playerStep = 0;
        currentState = STATE.SHOWING;
        
        // Revisar si toca cambiar el tamaño del tablero
        const neededSize = getGridSizeForLevel(level);
        if (neededSize !== currentGridSize) {
            createGrid(neededSize);
            setTimeout(() => addStepAndPlay(), 500);
        } else {
            addStepAndPlay();
        }
    }

    function addStepAndPlay() {
        const totalCells = currentGridSize * currentGridSize;
        const nextStep = Math.floor(Math.random() * totalCells);
        sequence.push(nextStep);
        updateStats();
        setTimeout(() => playSequence(), 800);
    }

    async function playSequence() {
        currentState = STATE.SHOWING;
        timerBar.style.width = '100%';
        timerBar.style.background = 'linear-gradient(90deg, #42e695, #3bb2b8)';
        
        const speedFactor = Math.max(0.4, 1 - (level * 0.03)); 
        const onTime = 500 * speedFactor;
        const offTime = 150 * speedFactor;

        for (let i = 0; i < sequence.length; i++) {
            if (currentState !== STATE.SHOWING) return;
            const cell = gridContainer.children[sequence[i]];
            if (cell) await highlightCell(cell, onTime);
            await wait(offTime);
        }

        totalTimeForRound = CONFIG.baseTimeLimit + (sequence.length * CONFIG.timePerStep);
        timeRemaining = totalTimeForRound; 
        startTimer();
        currentState = STATE.INPUT;
    }

    function highlightCell(cell, duration) {
        return new Promise(resolve => {
            const color = cell.dataset.color;
            cell.classList.add('lit');
            cell.style.backgroundColor = color;
            const freq = 300 + (parseInt(cell.dataset.index) * 30);
            playTone(freq, 'triangle', duration/1000);
            setTimeout(() => {
                cell.classList.remove('lit');
                cell.style.backgroundColor = '';
                resolve();
            }, duration);
        });
    }

    function handleInput(index, cell) {
        if (currentState !== STATE.INPUT) return;

        cell.classList.add('lit');
        cell.style.backgroundColor = cell.dataset.color;
        setTimeout(() => {
            cell.classList.remove('lit');
            cell.style.backgroundColor = '';
        }, 150);

        if (index === sequence[playerStep]) {
            playTone(400 + (index * 20), 'sine', 0.1);
            playerStep++;
            if (playerStep === sequence.length) {
                stopTimer();
                score += (level * 10) + Math.floor(timeRemaining / 100);
                level++;
                playTone(800, 'square', 0.1);
                currentState = STATE.SHOWING;
                setTimeout(nextRound, 800);
            }
        } else {
            playTone(150, 'sawtooth', 0.3);
            gameOver("¡Ups! Ese no era.");
        }
    }

    // --- UTILS ---
    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeRemaining -= 50;
            const percentage = (timeRemaining / totalTimeForRound) * 100;
            timerBar.style.width = `${percentage}%`;
            if (percentage < 30) timerBar.style.background = '#FF6B6B';
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                playTone(100, 'sawtooth', 0.5);
                gameOver("¡Se acabó el tiempo!");
            }
        }, 50);
    }
    
    function stopTimer() { if (timerInterval) clearInterval(timerInterval); }
    
    function togglePause() {
        if (currentState === STATE.GAMEOVER || currentState === STATE.IDLE) return;
        if (currentState === STATE.PAUSED) {
            currentState = previousState;
            overlay.classList.remove('visible');
            btnPause.textContent = '⏸️';
            if (currentState === STATE.INPUT) startTimer();
        } else {
            previousState = currentState;
            currentState = STATE.PAUSED;
            stopTimer();
            overlayTitle.innerHTML = "PAUSA";
            overlayMsg.style.display = 'block';
            overlayMsg.innerHTML = "Juego detenido";
            highscoreSection.classList.add('hidden');
            leaderboardSection.classList.add('hidden');
            btnStart.textContent = "CONTINUAR";
            overlay.classList.add('visible');
            btnPause.textContent = '▶️';
        }
    }

    // --- LEADERBOARD & GAME OVER ---
    function getLeaderboard() {
        return JSON.parse(localStorage.getItem('memoryGameScores')) || [];
    }

    function isHighscore(newScore) {
        if (newScore === 0) return false;
        const scores = getLeaderboard();
        if (scores.length < 3) return true;
        return newScore > scores[scores.length - 1].score;
    }

    function saveAndShow(name) {
        let scores = getLeaderboard();
        scores.push({ name: name.toUpperCase(), score: score });
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 3);
        localStorage.setItem('memoryGameScores', JSON.stringify(scores));
        showLeaderboardUI();
    }

    function showLeaderboardUI() {
        const scores = getLeaderboard();
        leaderboardList.innerHTML = '';
        if (scores.length === 0) leaderboardList.innerHTML = '<li>Sin Récords aún</li>';
        else {
            scores.forEach((entry, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const li = document.createElement('li');
                li.innerHTML = `<span>${medals[index]} ${entry.name}</span> <span>${entry.score} pts</span>`;
                leaderboardList.appendChild(li);
            });
        }
        highscoreSection.classList.add('hidden');
        leaderboardSection.classList.remove('hidden');
        overlayMsg.style.display = 'none';
        btnStart.textContent = "VOLVER A JUGAR";
        btnStart.style.display = 'inline-block';
    }

    function gameOver(reason) {
        stopTimer();
        currentState = STATE.GAMEOVER;
        gridContainer.classList.add('shake-anim');
        setTimeout(() => gridContainer.classList.remove('shake-anim'), 500);

        overlayTitle.innerHTML = "¡FIN DEL JUEGO!";
        overlayMsg.innerHTML = `${reason}<br>Puntos: ${score}`;
        overlay.classList.add('visible');
        btnRestart.disabled = true;

        if (isHighscore(score)) {
            btnStart.style.display = 'none';
            overlayMsg.style.display = 'none';
            highscoreSection.classList.remove('hidden');
            leaderboardSection.classList.add('hidden');
            playerNameInput.value = '';
            playerNameInput.focus();
        } else {
            showLeaderboardUI();
        }
    }

    // --- EVENTOS ---
    btnStart.addEventListener('click', startGame);
    btnRestart.addEventListener('click', () => gameOver("Reiniciado"));
    btnPause.addEventListener('click', togglePause);
    btnSound.addEventListener('click', toggleSound);

    btnSaveScore.addEventListener('click', () => {
        let name = playerNameInput.value.trim() || "JUGADOR";
        saveAndShow(name);
    });

    // Nuevo Evento: Botón X
    btnCloseScore.addEventListener('click', () => {
        showLeaderboardUI(); // Salta directamente a la tabla sin guardar
    });

    function updateStats() {
        levelDisplay.textContent = level;
        scoreDisplay.textContent = score;
    }
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    // Iniciar con pantalla 2x2
    createGrid(2);
});