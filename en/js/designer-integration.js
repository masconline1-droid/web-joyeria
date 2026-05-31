(function() {
	'use strict';

	const STORAGE_KEY = 'romet_design_state';

	const defaultState = {
		step: 1,
		category: null,
		material: null,
		profile: null,
		gemstone: null,
		style: null,
		budget: null,
		weight: null,
		size: null,
		name: null,
		phone: null,
		email: null,
		notes: null,
	};

	function loadState() {
		try {
			const saved = sessionStorage.getItem(STORAGE_KEY);
			return saved ? { ...defaultState, ...JSON.parse(saved) } : { ...defaultState };
		} catch (e) {
			return { ...defaultState };
		}
	}

	function saveState(state) {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}

	function clearState() {
		sessionStorage.removeItem(STORAGE_KEY);
	}

	function detectCurrentStep() {
		const bodyText = document.body.textContent || '';
		if (bodyText.includes('Paso 1 de 7') || bodyText.includes('Categoría')) return 1;
		if (bodyText.includes('Paso 2 de 7') || bodyText.includes('Material')) return 2;
		if (bodyText.includes('Paso 3 de 7') || bodyText.includes('Perfil')) return 3;
		if (bodyText.includes('Paso 4 de 7') || bodyText.includes('Gema')) return 4;
		if (bodyText.includes('Paso 5 de 7') || bodyText.includes('Estilo')) return 5;
		if (bodyText.includes('Paso 6 de 7') || bodyText.includes('Especificaciones')) return 6;
		if (bodyText.includes('Paso 7 de 7') || bodyText.includes('Registro')) return 7;
		return null;
	}

	function hookFormInputs(step) {
		const state = loadState();

		if (step === 6) {
			const inputs = document.querySelectorAll('input');
			if (inputs[0]) {
				inputs[0].addEventListener('input', function() { state.budget = this.value; saveState(state); });
				if (state.budget) inputs[0].value = state.budget;
			}
			if (inputs[1]) {
				inputs[1].addEventListener('input', function() { state.weight = this.value; saveState(state); });
				if (state.weight) inputs[1].value = state.weight;
			}
			if (inputs[2]) {
				inputs[2].addEventListener('input', function() { state.size = this.value; saveState(state); });
				if (state.size) inputs[2].value = state.size;
			}
		}

		if (step === 7) {
			const allInputs = document.querySelectorAll('input, textarea');
			allInputs.forEach((input) => {
				const type = input.type;
				const label = input.closest('.space-y-2')?.querySelector('label')?.textContent?.toLowerCase() || '';

				input.addEventListener('input', function() {
					if (label.includes('nombre') || (type === 'text' && !label.includes('talla'))) {
						state.name = input.value;
					} else if (label.includes('telefono') || label.includes('teléfono') || type === 'tel') {
						state.phone = input.value;
					} else if (label.includes('correo') || label.includes('email') || type === 'email') {
						state.email = input.value;
					} else if (input.tagName === 'TEXTAREA') {
						state.notes = input.value;
					}
					saveState(state);
					checkSubmitValidity();
				});

				if ((label.includes('nombre') || type === 'text') && state.name) input.value = state.name;
				if ((label.includes('telefono') || type === 'tel') && state.phone) input.value = state.phone;
				if ((label.includes('correo') || type === 'email') && state.email) input.value = state.email;
				if (input.tagName === 'TEXTAREA' && state.notes) input.value = state.notes;
			});

			autoFillFromSession(state);
			checkSubmitValidity();
		}
	}

	async function autoFillFromSession(state) {
		// Auto-fill disabled by request: so the jeweler can insert different clients' emails.
		checkSubmitValidity();
	}

	function checkSubmitValidity() {
		const submitBtn = document.querySelector('button[type="submit"]');
		if (!submitBtn) return;
		const state = loadState();
		const valid = state.name && state.email && state.phone;
		submitBtn.disabled = !valid;
	}

	function hookSubmitButton() {
		const form = document.querySelector('form');
		const submitBtn = document.querySelector('button[type="submit"]');
		if (!submitBtn) return;

		if (form) {
			form.addEventListener('submit', handleDesignSubmit);
		} else {
			submitBtn.addEventListener('click', handleDesignSubmit);
		}
	}

	async function handleDesignSubmit(e) {
		e.preventDefault();
		const state = loadState();
		const submitBtn = document.querySelector('button[type="submit"]');

		if (!state.name || !state.email) {
			showNotification('Por favor, completa tu nombre y correo electrónico.', 'error');
			return;
		}

		submitBtn.disabled = true;
		const originalText = submitBtn.textContent;
		submitBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Generating your AI design...</span>';

		try {
			const hasCredits = typeof window.consumeCredit === 'function' ? await window.consumeCredit() : true;
			if (!hasCredits) {
				showNotification('¡Vaya! No tienes suficientes créditos para generar este diseño. Compra más créditos en tu cuenta.', 'error');
				submitBtn.disabled = false;
				submitBtn.textContent = originalText;
				return;
			}
		} catch(e) {
			console.warn('Verificación de créditos omitida', e);
		}

		try {
			const result = await callEdgeFunction('Joyas', {
				nombre: state.name,
				telefono: state.phone,
				email: state.email,
				categoria_producto: state.category,
				material: state.material,
				perfil_usuario: state.profile,
				gema_principal: state.gemstone,
				estilo: state.style,
				presupuesto: state.budget,
				peso_estimado: state.weight,
				talla_medida: state.size,
				sugerencias: state.notes,
			});

			showSuccessScreen(state, result?.imagenUrl || null);
			clearState();

		} catch (error) {
			console.error('Error:', error);
			showNotification('An error has occurred. Please try again.', 'error');
			submitBtn.disabled = false;
			submitBtn.textContent = originalText;
		}
	}

	async function rediseñar(state, cambios) {
		const redesignBtn = document.getElementById('redesign-btn');
		const imagenContainer = document.getElementById('imagen-generada');
		const prevImgHTML = imagenContainer ? imagenContainer.innerHTML : '';

		if (redesignBtn) {
			redesignBtn.disabled = true;
			redesignBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Redesigning...</span>';
		}

		if (imagenContainer) {
			imagenContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;"><svg class="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>';
		}

		try {
			const hasCredits = typeof window.consumeCredit === 'function' ? await window.consumeCredit() : true;
			if (!hasCredits) {
				showNotification('No tienes suficientes créditos para rediseñar. Compra más créditos en tu cuenta.', 'error');
				if (redesignBtn) {
					redesignBtn.disabled = false;
					redesignBtn.textContent = 'Redesign';
				}
				if (imagenContainer) {
					imagenContainer.innerHTML = prevImgHTML;
				}
				return;
			}
		} catch(e) {
			console.warn('Verificación de créditos omitida', e);
		}

		try {
			const result = await callEdgeFunction('Joyas', {
				nombre: state.name,
				telefono: state.phone,
				email: state.email,
				categoria_producto: state.category,
				material: state.material,
				perfil_usuario: state.profile,
				gema_principal: state.gemstone,
				estilo: state.style,
				presupuesto: state.budget,
				peso_estimado: state.weight,
				talla_medida: state.size,
				sugerencias: state.notes,
				imagen_subida_url: state._lastImagenUrl,
				cambios_solicitados: cambios,
				is_redesign: true
			});

			if (imagenContainer && result?.imagenUrl) {
				imagenContainer.innerHTML = `<img src="${result.imagenUrl}" style="max-width:100%; border-radius:8px;" />`;
			}

			const cambiosPanel = document.getElementById('cambios-panel');
			if (cambiosPanel) cambiosPanel.style.display = 'none';

		} catch (error) {
			console.error('Error redesigning:', error);
			if (imagenContainer) {
				imagenContainer.innerHTML = '<p style="color:#888;text-align:center;">Error redesigning. Try again.</p>';
			}
		}

		if (redesignBtn) {
			redesignBtn.disabled = false;
			redesignBtn.textContent = 'Redesign';
		}
	}

	function toggleCambiosPanel(state) {
		const panel = document.getElementById('cambios-panel');
		if (!panel) return;
		const visible = panel.style.display !== 'none';
		panel.style.display = visible ? 'none' : 'block';
	}

	function showSuccessScreen(state, imagenUrl) {
		const main = document.querySelector('main') || document.querySelector('.flex-1');
		if (!main) return;

		main.innerHTML = `
			<div class="max-w-3xl mx-auto px-4 py-12 text-center" style="animation: fadeInUp 0.8s ease-out;">
				<div class="mb-8">
					<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none"
					     stroke="hsl(120, 40%, 40%)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
					     style="margin: 0 auto 1.5rem;">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
						<polyline points="22 4 12 14.01 9 11.01"/>
					</svg>
					<h1 class="text-4xl md:text-5xl text-foreground tracking-widest uppercase font-medium mb-4">
						¡Diseño Creado!
					</h1>
					<p class="text-muted-foreground font-sans tracking-wide max-w-lg mx-auto text-lg">
						We have received your request, <strong>${state.name}</strong>.
						We will contact you soon at <strong>${state.email}</strong>.
					</p>
				</div>

				${imagenUrl ? `
				<div class="bg-white p-8 rounded-2xl shadow-lg border border-border/50 mb-8"
				     style="animation: fadeInUp 0.8s ease-out 0.2s both;">
					<h2 class="text-xl tracking-widest uppercase text-foreground font-medium mb-4">Your Generated Design</h2>
					<div id="imagen-generada">
						<img src="${imagenUrl}" style="max-width:100%; border-radius:8px;" />
					</div>
				</div>` : `
				<div class="bg-white p-8 rounded-2xl shadow-lg border border-border/50 mb-8"
				     style="animation: fadeInUp 0.8s ease-out 0.2s both;">
					<div id="imagen-generada">
						<p class="text-muted-foreground font-sans">
							Your design is being processed. You will receive an email with the result shortly.
						</p>
					</div>
				</div>`}

				<div id="cambios-panel" style="display:none;" class="bg-white p-6 rounded-2xl shadow-lg border border-border/50 mb-6 text-left">
					<p class="text-sm tracking-widest uppercase text-muted-foreground font-sans font-medium mb-3">Describe the changes</p>
					<textarea id="cambios-texto"
					          placeholder="Write the changes you want to adjust the design..."
					          class="w-full border border-border p-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all duration-300 text-base font-serif min-h-[100px] resize-y rounded-md mb-3"></textarea>
					<p style="color: #e53e3e; font-size: 0.8rem; font-family: ui-sans-serif, system-ui, sans-serif; margin-bottom: 12px;">
						⚠️ This change will consume 1 credit
					</p>
					<button id="redesign-btn"
					        onclick="(function(){
					        	const cambios = document.getElementById('cambios-texto').value.trim();
					        	if (!cambios) return;
					        	window._redisenar(cambios);
					        })()"
					        style="background: hsl(0 0% 0%); color: hsl(0 0% 80%); padding: 12px 32px;
					               font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.8rem;
					               letter-spacing: 0.2em; text-transform: uppercase; border: none;
					               cursor: pointer; transition: opacity 0.3s;">
						Redesign
					</button>
				</div>

				<div class="bg-white p-6 rounded-2xl shadow-lg border border-border/50 text-left mb-8"
				     style="animation: fadeInUp 0.8s ease-out 0.4s both;">
					<h2 class="text-xl tracking-widest uppercase text-foreground font-medium mb-4">Design Summary</h2>
					<div class="grid grid-cols-2 gap-4 font-sans text-sm">
						${state.category ? `<div><span class="text-muted-foreground">Type:</span> <strong class="capitalize">${state.category}</strong></div>` : ''}
						${state.material ? `<div><span class="text-muted-foreground">Material:</span> <strong class="capitalize">${state.material.replace(/_/g, ' ')}</strong></div>` : ''}
						${state.gemstone ? `<div><span class="text-muted-foreground">Gemstone:</span> <strong class="capitalize">${state.gemstone}</strong></div>` : ''}
						${state.style ? `<div><span class="text-muted-foreground">Style:</span> <strong class="capitalize">${state.style}</strong></div>` : ''}
						${state.budget ? `<div><span class="text-muted-foreground">Budget:</span> <strong>${state.budget}€</strong></div>` : ''}
						${state.size ? `<div><span class="text-muted-foreground">Size:</span> <strong>${state.size}</strong></div>` : ''}
					</div>
				</div>

				<div style="max-width: 400px; margin: 0 auto; animation: fadeInUp 0.8s ease-out 0.6s both;">

					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">

						<button onclick="window._toggleCambios()"
						        style="background: hsl(0 0% 0%); color: hsl(0 0% 75%);
						               font-family: 'Cormorant Garamond', serif; font-size: 1.1rem;
						               font-weight: 400; letter-spacing: 0.03em;
						               border: none; cursor: pointer; transition: opacity 0.3s;
						               text-align: center; width: 185px; height: 185px;
						               display: flex; align-items: center; justify-content: center;
						               padding: 16px; line-height: 1.3;">
							WOULD YOU LIKE TO MAKE ANY CHANGES?
						</button>

						<a href="#"
						   style="display: block; text-decoration: none;
						          width: 185px; height: 185px;
						          cursor: pointer; overflow: hidden;">
							<img src="./designer-paso7_files/Meneses-joyas-stl-dis.png"
							     style="width: 100%; height: 100%; object-fit: cover; display: block;" />
						</a>

					</div>

					<div style="text-align: center; padding-top: 8px;">
						<a href="./index.html"
						   style="color: hsl(0 0% 0%); font-family: ui-sans-serif, system-ui, sans-serif;
						          font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase;
						          text-decoration: none; transition: opacity 0.3s; display: inline-block;
						          padding: 12px 32px;">
							Back to Home
						</a>
					</div>

				</div>
			</div>
		`;

		window._toggleCambios = () => toggleCambiosPanel(state);
		window._redisenar = (cambios) => rediseñar(state, cambios);

		if (!document.getElementById('romet-animations')) {
			const style = document.createElement('style');
			style.id = 'romet-animations';
			style.textContent = `
				@keyframes fadeInUp {
					from { opacity: 0; transform: translateY(20px); }
					to { opacity: 1; transform: translateY(0); }
				}
				.animate-spin { animation: spin 1s linear infinite; }
				@keyframes spin { to { transform: rotate(360deg); } }
			`;
			document.head.appendChild(style);
		}

		const bottomNav = document.querySelector('.fixed.bottom-0');
		if (bottomNav) bottomNav.style.display = 'none';
	}

	function showNotification(message, type = 'info') {
		document.querySelector('.romet-notification')?.remove();

		const colors = {
			success: { bg: 'hsl(120, 40%, 96%)', border: 'hsl(120, 40%, 80%)', text: 'hsl(120, 40%, 30%)' },
			error: { bg: 'hsl(0, 84%, 97%)', border: 'hsl(0, 84%, 85%)', text: 'hsl(0, 84%, 40%)' },
			info: { bg: 'hsl(210, 40%, 96%)', border: 'hsl(210, 40%, 80%)', text: 'hsl(210, 40%, 30%)' },
		};

		const c = colors[type] || colors.info;
		const notification = document.createElement('div');
		notification.className = 'romet-notification';
		notification.style.cssText = `
			position: fixed; top: 24px; right: 24px; z-index: 9999;
			padding: 16px 24px; max-width: 400px;
			background: ${c.bg}; border: 1px solid ${c.border}; color: ${c.text};
			font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px;
			border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
		`;
		notification.textContent = message;
		document.body.appendChild(notification);
		setTimeout(() => notification.remove(), 5000);
	}

	function init() {
		const step = detectCurrentStep();
		if (step === null) return;

		if (step === 6) hookFormInputs(6);
		if (step === 7) {
			hookFormInputs(7);
			hookSubmitButton();
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		setTimeout(init, 300);
	}

	window.RometDesigner = {
		loadState,
		saveState,
		clearState,
		showNotification,
	};

})();
