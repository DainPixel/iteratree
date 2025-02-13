document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements and Initial Variables
    const promptInput = document.getElementById('prompt-input');
    const generateButton = document.getElementById('generate-button');
    const treeContainer = document.getElementById('tree-container');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const bestImagesContainer = document.getElementById('best-images');
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); // SVG 생성
    const nodeData = {}; // 노드 데이터를 저장할 전역 객체

    treeContainer.appendChild(svg); // 트리 컨테이너에 추가

    let zoomLevel = 1;
    let nodeCounter = 0;
    let selectedNodeId = null; // Currently selected node ID
    const tree = { id: "root", children: [] };
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let translateX = 0;
    let translateY = 0;

    // Ensure the tree container is infinitely scrollable
    treeContainer.style.position = 'relative';
    treeContainer.style.minWidth = '4000px';
    treeContainer.style.minHeight = '4000px';
    treeContainer.style.overflow = 'hidden';

// Function to create a new image node
async function createImageNode(userInputPrompt, parentId = "root", optimizedPrompt = null) {
    const container = document.createElement("div");
    container.className = "image-container";
    container.dataset.id = `node-${nodeCounter++}`;
    container.dataset.parentId = parentId;
    container.style.position = "absolute";

    const nodeId = container.dataset.id;

    // Add placeholder content while loading the image
    container.innerHTML = `
        <img src="https://via.placeholder.com/300" style="width: 80%;">
        <p>${userInputPrompt}</p>
        <button class="save-best">Save to Best</button>
        <button class="reiterate">AI assist</button>
    `;

    treeContainer.appendChild(container);

    try {
        // Fetch the generated image and revised prompt
        const { imageUrl, revisedPrompt } = await fetchGeneratedImage(optimizedPrompt || userInputPrompt);
        console.log("Revised Prompt:", revisedPrompt);

        // Update node data with the generated information
        saveNodeData(nodeId, { inputPrompt: userInputPrompt, revisedPrompt });

        // Update the UI with the generated image and revised prompt
        const img = container.querySelector("img");
        img.src = imageUrl;

        const promptText = container.querySelector("p");
        promptText.textContent = userInputPrompt;

    } catch (error) {
        console.error("Failed to load generated image:", error);
    }

    // Add event listeners for the buttons
    const saveButton = container.querySelector(".save-best");
    saveButton.addEventListener("click", () => saveToBest(container));

    const reGenerateButton = container.querySelector(".reiterate");
    reGenerateButton.addEventListener("click", () => handleReGenerate(container));

    // Update the tree structure
    const parentNode = findNodeById(tree, parentId);
    if (parentNode) {
        parentNode.children.push({ id: nodeId, children: [] });
    }

    // Align tree nodes
    arrangeTreeNodes(tree);

    // Automatically select the newly generated node
    selectImage(container);
}
    

    // image generate
    async function fetchGeneratedImage(prompt) {
        console.log("Fetching generated image for prompt:", prompt); // 호출 시마다 로그
        try {
            const response = await fetch("/dalle", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ prompt }),
            });
    
            if (!response.ok) {
                throw new Error("Failed to fetch image from server");
            }
    
            const data = await response.json();
            console.log("Generated Image URL:", data.url);
            console.log("Revised Prompt:", data.revisedPrompt || "No revised prompt field");
    
            return {
                imageUrl: data.url,
                revisedPrompt: data.revisedPrompt || "No revised prompt field",
            }; // 이미지 URL과 revisedPrompt 반환
            
        } catch (error) {
            console.error("Error fetching generated image:", error.message);
            return {
                imageUrl: "https://via.placeholder.com/300", // 오류 시 기본 이미지
                revisedPrompt: "No revised prompt field",
            };
        }
    }
    
    
// Generate 버튼 동작
generateButton.addEventListener("click", async () => {
    const userInputPrompt = promptInput.value.trim();

    if (userInputPrompt) {
        try {
            if (!selectedNodeId || selectedNodeId === "root") {
                // 부모가 없는 경우
                console.log("Creating first node...");
                const { imageUrl, revisedPrompt } = await fetchGeneratedImage(userInputPrompt);
                
                // 첫 번째 노드는 GPT 호출 없이 생성
                createImageNode(userInputPrompt, "root", null);
                saveNodeData("root", { inputPrompt: userInputPrompt, revisedPrompt }); // revisedPrompt 저장
            
            
            } else {
                // 부모가 있는 경우 (자식 노드 생성)
                console.log("Creating child node...");
                const parentData = getNodeData(selectedNodeId);

                if (!parentData.inputPrompt || !parentData.revisedPrompt) {
                    throw new Error("Parent node data is incomplete.");
                }
                

                // GPT로 최적화된 프롬프트 생성 (부모가 있는 경우에만)
                const optimizedPrompt = await fetchOptimizedPrompt(
                    parentData.inputPrompt,
                    parentData.revisedPrompt,
                    userInputPrompt
                );

                // DALL-E API 호출
                const { imageUrl, revisedPrompt } = await fetchGeneratedImage(optimizedPrompt);
                createImageNode(userInputPrompt, selectedNodeId, optimizedPrompt);
                saveNodeData(selectedNodeId, { inputPrompt: userInputPrompt, revisedPrompt });
            }

            promptInput.value = ""; // 입력 필드 초기화
        } catch (error) {
            console.error("Error during image generation:", error.message);
        }
    } else {
        console.warn("Prompt is empty. Please enter a valid prompt.");
    }
});



// GPT 요청
async function fetchOptimizedPrompt(parentInputPrompt, parentRevisedPrompt, userInputPrompt) {
    try {
        console.log("Optimized Prompt Request Data:", {
            parentInputPrompt,
            parentRevisedPrompt,
            userInputPrompt,
        });

        const response = await fetch("/gpt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                parentInputPrompt,
                parentRevisedPrompt,
                userInputPrompt,
                taskType: "generate",
            }),

        });

        const data = await response.json();

        if (!data.optimizedPrompt || typeof data.optimizedPrompt !== "string") {
            throw new Error("GPT did not return a valid optimized prompt.");
        }

        return data.optimizedPrompt; // 최적화된 프롬프트 반환
    } catch (error) {
        console.error("Error optimizing prompt:", error.message);
        throw error;
    }
}



    function saveNodeData(nodeId, data) {
        nodeData[nodeId] = {
            inputPrompt: data.inputPrompt,
            revisedPrompt: data.revisedPrompt,
        };
        console.log("Node Data Updated:", nodeData); // 모든 노드 데이터 출력
        console.log(`Node [${nodeId}] Data:`, nodeData[nodeId]); // 현재 노드 데이터 출력
    }
    
    function getNodeData(nodeId) {
        return nodeData[nodeId] || {};
    }
    

    function selectImage(container) {
        // remove selection
        document.querySelectorAll('.image-container').forEach(node => {
            node.classList.remove('selected');
        });
    
        // add selected class to new node
        container.classList.add('selected');
        selectedNodeId = container.dataset.id; // 선택된 노드 ID 업데이트
        console.log(`Selected Node: ${selectedNodeId}`);
    }

    // Copy Prompt to Input
    async function handleReGenerate(container) {
        const prompt = container.querySelector("p").textContent; // 사용자 입력 프롬프트
        const taskType = "reiterate"; // Task type 설정

        try {
            const response = await fetch("/gpt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, taskType }), // prompt 사용
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch hints: ${response.statusText}`);
            }

            const data = await response.json(); // 응답 데이터 파싱
            const hints = data.hints || []; // hints가 없을 경우 빈 배열로 초기화
            console.log("Hints received:", hints);

            // Input에 텍스트 복사 (HTML 태그 제외)
            const promptInput = document.getElementById("prompt-input");
            promptInput.value = prompt; // Plain text

            // 힌트 표시
            displayHints(hints);
        } catch (error) {
            console.error("Error fetching hints:", error.message);
        }
    }

    // 힌트 표시 함수
    function displayHints(hints) {
        const existingPopup = document.querySelector(".question-popup");
        if (existingPopup) {
            existingPopup.remove(); // 기존 팝업 제거
        }

        const popup = document.createElement("div");
        popup.className = "question-popup";

        // 힌트 내용 추가
        if (hints.length > 0) {
            // Question 필터링
            const questions = hints.filter(hint => hint.startsWith("Question:"));
            console.log("Filtered Questions:", questions); // 필터링 결과 디버깅

            // 질문이 있으면 추가
            if (questions.length > 0) {
                popup.textContent = questions.map(q => q.replace("Question:", "").trim()).join(" ");
            } else {
                popup.textContent = "No questions available.";
            }
        } else {
            popup.textContent = "No hints available.";
        }

        // 팝업을 body에 추가
        document.body.appendChild(popup);

        // 일정 시간이 지나면 팝업 제거
        setTimeout(() => {
            popup.remove();
        }, 10000); // 10초 후 제거
    }




    // 트리 정렬 함수
    function arrangeTreeNodes(node, depth = 0, offsetX = treeContainer.clientWidth / 2) {
        const SPACING = 400; // 자식 간 가로 간격
        const VERTICAL_SPACING = 350; // 부모-자식 간 세로 간격
        // 현재 노드 위치 계산
        const currentX = offsetX;
        const currentY = depth * VERTICAL_SPACING;

        // DOM에서 현재 노드 찾기
        const domNode = document.querySelector(`[data-id="${node.id}"]`);
        if (domNode) {
            domNode.style.left = `${currentX}px`;
            domNode.style.top = `${currentY}px`;
        }

        // 자식 노드 배치
        if (node.children.length > 0) {
            const totalWidth = (node.children.length - 1) * SPACING; // 자식 노드 폭 계산
            let startX = currentX - totalWidth / 2;

            node.children.forEach((child, index) => {
                // arrangeTreeNodes(child, depth + 1, startX + index * SPACING);
                const childX = startX + index * SPACING;
                arrangeTreeNodes(child, depth + 1, childX);

                drawLine(domNode, document.querySelector(`[data-id="${child.id}"]`));
            });
        }
        updateSvgSize();
    }

    // 트리에서 특정 노드 찾기
    function findNodeById(node, id) {
        if (node.id === id) return node;
        for (const child of node.children) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
        return null;
    }

// 부모와 자식을 선으로 연결
function drawLine(parentNode, childNode) {
    if (!parentNode || !childNode) return;

    // 트리 컨테이너와 SVG의 좌표를 동기화
    const treeRect = treeContainer.getBoundingClientRect();
    const parentRect = parentNode.getBoundingClientRect();
    const childRect = childNode.getBoundingClientRect();

    // 부모와 자식의 중심 좌표 계산
    const parentX = parentRect.left + parentRect.width / 2 - treeRect.left;
    const parentY = parentRect.top + parentRect.height / 2 - treeRect.top;
    const childX = childRect.left + childRect.width / 2 - treeRect.left;
    const childY = childRect.top + childRect.height / 2 - treeRect.top;

    // 기존 연결 선 삭제
    const existingLine = svg.querySelector(`[data-parent="${parentNode.dataset.id}"][data-child="${childNode.dataset.id}"]`);
    if (existingLine) existingLine.remove();

    // 새로운 선 추가
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", parentX);
    line.setAttribute("y1", parentY);
    line.setAttribute("x2", childX);
    line.setAttribute("y2", childY);
    line.setAttribute("stroke", "black");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("data-parent", parentNode.dataset.id);
    line.setAttribute("data-child", childNode.dataset.id);

    svg.appendChild(line);
}

// 트리 전체 정렬 시 SVG 크기 업데이트
function updateSvgSize() {
    // 트리 컨테이너와 동일한 크기로 SVG 설정
    svg.setAttribute("width", treeContainer.offsetWidth);
    svg.setAttribute("height", treeContainer.offsetHeight);
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
}

    // Save to Best 버튼 동작
    function saveToBest(container) {
        // 이미지를 선택
        const image = container.querySelector("img");
        if (!image) return; // 이미지가 없으면 동작 중단
    
        // 기존 이미지를 확인하여 중복 방지
        const existingImage = bestImagesContainer.querySelector(`[data-id="${container.dataset.id}"]`);
        if (existingImage) {
            existingImage.remove(); // 중복일 경우 제거
            container.classList.remove("highlighted");
            return;
        }
    
        // 이미지 복제 및 추가
        const imageClone = image.cloneNode(true);
        imageClone.dataset.id = container.dataset.id; // 이미지 ID 추가
        bestImagesContainer.appendChild(imageClone);
    
        // 선택된 상태 강조
        container.classList.add("highlighted");
    }

    // 트리 노드 선택
    treeContainer.addEventListener("click", (event) => {
        const clickedNode = event.target.closest(".image-container");
        if (clickedNode) {
            selectedNodeId = clickedNode.dataset.id;
            document.querySelectorAll('.image-container').forEach(node => node.classList.remove('selected'));
            clickedNode.classList.add('selected');
        }
    });


    // Zoom In 버튼
    zoomInButton.addEventListener('click', () => {
        zoomLevel += 0.1;
        applyTransform();
        updateZoomLevelDisplay(); // 줌 레벨 업데이트
    });

    // Zoom Out 버튼
    zoomOutButton.addEventListener('click', () => {
        zoomLevel = Math.max(0.5, zoomLevel - 0.1);
        applyTransform();
        updateZoomLevelDisplay(); // 줌 레벨 업데이트
    });

    function applyTransform() {
        treeContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;
        treeContainer.style.transformOrigin = '0 0';
    }

    // Drag and Drop 기능
    treeContainer.addEventListener("mousedown", (event) => {
        isDragging = true;
        dragStartX = event.clientX - translateX;
        dragStartY = event.clientY - translateY;
        treeContainer.style.cursor = "grabbing";
    });

    function updateZoomLevelDisplay() {
        const zoomLevelDisplay = document.getElementById("zoom-level");
        zoomLevelDisplay.textContent = `x ${zoomLevel.toFixed(1)}`; // 소수점 한 자리로 표시
    }

    treeContainer.addEventListener("mousemove", (event) => {
        if (isDragging) {
            translateX = event.clientX - dragStartX;
            translateY = event.clientY - dragStartY;
            applyTransform();
        }
    });


    treeContainer.addEventListener("mouseup", () => {
        isDragging = false;
        treeContainer.style.cursor = "default";
    });

    treeContainer.addEventListener("mouseleave", () => {
        isDragging = false;
        treeContainer.style.cursor = "default";
    });
});

