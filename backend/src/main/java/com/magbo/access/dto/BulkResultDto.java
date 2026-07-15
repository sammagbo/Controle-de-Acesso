package com.magbo.access.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Data
public class BulkResultDto {
    private int totalRecebido;
    private int totalCriado;
    private int totalAtualizado;
    private int totalIgnorado;
    private int totalFalhas;
    private List<Map<String, String>> erros = new ArrayList<>();
}
