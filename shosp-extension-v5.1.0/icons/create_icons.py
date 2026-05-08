from PIL import Image, ImageDraw

def create_icon(size, filename):
    # Criar imagem com fundo azul
    img = Image.new('RGBA', (size, size), (59, 130, 246, 255))
    draw = ImageDraw.Draw(img)
    
    # Desenhar círculo branco (microfone simplificado)
    center = size // 2
    radius = size // 4
    
    # Corpo do microfone
    mic_width = size // 5
    mic_height = size // 3
    mic_x = center - mic_width // 2
    mic_y = center - mic_height // 2 - size // 10
    
    draw.rounded_rectangle(
        [mic_x, mic_y, mic_x + mic_width, mic_y + mic_height],
        radius=mic_width // 2,
        fill='white'
    )
    
    # Base do microfone
    base_y = mic_y + mic_height + size // 20
    draw.arc(
        [center - mic_width, base_y - mic_width // 2, center + mic_width, base_y + mic_width // 2],
        start=0, end=180,
        fill='white',
        width=max(2, size // 16)
    )
    
    # Linha vertical
    line_y = base_y + mic_width // 4
    draw.line(
        [center, line_y, center, line_y + size // 8],
        fill='white',
        width=max(2, size // 16)
    )
    
    # Linha horizontal
    draw.line(
        [center - size // 8, line_y + size // 8, center + size // 8, line_y + size // 8],
        fill='white',
        width=max(2, size // 16)
    )
    
    img.save(filename)

# Criar ícones em diferentes tamanhos
create_icon(16, '/home/ubuntu/shosp_interface/chrome-extension/icons/icon16.png')
create_icon(32, '/home/ubuntu/shosp_interface/chrome-extension/icons/icon32.png')
create_icon(48, '/home/ubuntu/shosp_interface/chrome-extension/icons/icon48.png')
create_icon(128, '/home/ubuntu/shosp_interface/chrome-extension/icons/icon128.png')

print("Ícones criados com sucesso!")
