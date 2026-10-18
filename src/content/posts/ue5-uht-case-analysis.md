---
title: "UE5 反射系统与底层架构深度解析（番外）：从代码简要解析generated.h，gen.cpp文件"
description: "从代码层面解析 Unreal Header Tool（UHT）生成的 .generated.h 和 .gen.cpp 文件，深入理解虚幻引擎反射系统的底层原理与设计哲学。"
pubDate: 2026-09-29
tags: ["Unreal Engine", "UE5", "UHT", "反射系统", "C++", "底层原理"]
category: "引擎开发"
series: "UE5 反射系统与底层架构深度解析"
seriesOrder: 6
draft: false
---

## 前言

在虚幻引擎开发中，每个带有反射属性的类都会伴生一份 `.generated.h` 与 `.gen.cpp` 文件。很多开发者对这些自动生成的代码心存敬畏却未曾逐行细读。本文基于一个最基础的 `ADreamGameModeBase` 案例，将 UHT 生成的两个核心文件拆解为各个功能模块切片，保持所有原生代码的纯净性，并逐段附带详尽的逐行解析，最后对热重载虚表桩、反射宏与延迟注册等底层机制进行专题深挖。

---

## 源代码

### 1. Dream_GameModeBase.h

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Dream_GameModeBase.generated.h"

UCLASS()
class DREAM_API ADreamGameModeBase : public AGameModeBase
{
	GENERATED_BODY()
	
public:
	ADreamGameModeBase();
};
```

### 2. Dream_GameModeBase.cpp

```cpp
#include "Core/Dream_GameModeBase.h"
#include "Core/Dream_PlanePawn.h"
#include "Core/Dream_PlayerController.h"

ADreamGameModeBase::ADreamGameModeBase()
{
	PlayerControllerClass = ADreamPlayerController::StaticClass();
	DefaultPawnClass = ADreamPlanePawn::StaticClass();
}
```

---

## UHT 生成代码拆解与解析

### 一、Dream_GameModeBase.generated.h

#### 1. 预编译防重包含与警告抑制

```cpp
#ifdef DREAM_Dream_GameModeBase_generated_h
#error "Dream_GameModeBase.generated.h already included, missing '#pragma once' in Dream_GameModeBase.h"
#endif

#define DREAM_Dream_GameModeBase_generated_h

#include "UObject/ObjectMacros.h"
#include "UObject/ScriptMacros.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS
```

**【逐行原理解析】**
- **`#ifdef ... #error ...`**：检查是否已经被定义了 if defined；error 触发编译报错并中断，在编译器输出日志中打印自定义错误信息提醒。
- **`#define DREAM_Dream_GameModeBase_generated_h`**：防止同一个头文件被重复包含。
- **`PRAGMA_DISABLE_DEPRECATION_WARNINGS`**：防止编译器对过时、废弃的代码（API）发出警告；虚幻 UBT 对所有警告都默认报错中断。

---

#### 2. 类前置声明与全局访问接口

```cpp
// Begin Class ADreamGameModeBase
struct Z_Construct_UClass_ADreamGameModeBase_Statics;

DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();
```

**【逐行原理解析】**
- **`struct Z_Construct_UClass_ADreamGameModeBase_Statics;`**：静态数据容器，存放：依赖项清单，编辑器元数据，C++ 类型特征，参数大汇总，然后交予 `Z_Construct_UClass_ADreamGameModeBase` 中分配内存。
- **`DREAM_API`**：项目专属宏，游戏逻辑会被编译成 `UnrealEditor-Dream.dll`。自我编译时展开为 `__declspec(dllexport)`（向外导出，公开给别人用）；被引用编译时展开为 `__declspec(dllimport)`（从别的 DLL 导入）。
- **`Z_Construct_UClass_ADreamGameModeBase_NoRegister()`**：跨模块轻量查询接口声明。

---

#### 3. 类内反射与类型系统专属模块（INCLASS_NO_PURE_DECLS）

```cpp
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
private: \
	static void StaticRegisterNativesADreamGameModeBase(); \
	friend struct ::Z_Construct_UClass_ADreamGameModeBase_Statics; \
	static UClass* GetPrivateStaticClass(); \
	friend DREAM_API UClass* ::Z_Construct_UClass_ADreamGameModeBase_NoRegister(); \
public: \
	DECLARE_CLASS2(ADreamGameModeBase, AGameModeBase, COMPILED_IN_FLAGS(0 | CLASS_Transient | CLASS_Config), CASTCLASS_None, TEXT("/Script/Dream"), Z_Construct_UClass_ADreamGameModeBase_NoRegister) \
	DECLARE_SERIALIZER(ADreamGameModeBase)
```

**【逐行原理解析】**
- **宏名称定位**：`INCLASS`（类内声明），`NO_PURE_DECLS`（非纯声明）。声明类内的静态成员函数，供构造函数模块使用，必须注入到 class 内部的代码，属于反射与类型系统专属模块。
- **`StaticRegisterNativesADreamGameModeBase()`**：把 C++ 函数指针注册给蓝图虚拟机。
- **`friend struct ::Z_Construct_UClass_ADreamGameModeBase_Statics;`**：友元创建，让反射构造器可以访问类的私有静态指针。
- **`GetPrivateStaticClass()`**：懒加载创建单例对象。
- **`friend DREAM_API UClass* ::Z_Construct_UClass_ADreamGameModeBase_NoRegister();`**：跨模块轻量查询，通过这个访问 `GetPrivateStaticClass`；因为是外部全局函数，所以要友元声明。
- **`DECLARE_CLASS2(...)`**：核心能力总成（类型别名、公开静态获取器与快速类型转换）：
  - 生成 `typedef XXX ThisClass;`
  - 生成 `typedef XXX父类 Super;`
  - 生成 `StaticClass()` 供以获取类型元数据；
  - 为 `Cast<XXX>(Obj)` 提供底层快速位掩码（`CASTCLASS_None`：底层枚举 `EClassCastFlags`）。
- **`DECLARE_SERIALIZER(...)`**：注入虚幻专用的存盘与网络同步接口，重载输入输出流操作符：
  - `friend FArchive& operator<<(FArchive& Ar, XXX*& Res);`

---

#### 4. C++ 语法与生命周期安全模块（ENHANCED_CONSTRUCTORS）

```cpp
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
	/** Deleted move- and copy-constructors, should never be used */ \
	ADreamGameModeBase(ADreamGameModeBase&&) = delete; \
	ADreamGameModeBase(const ADreamGameModeBase&) = delete; \
	DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase); \
	DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(ADreamGameModeBase); \
	DEFINE_DEFAULT_CONSTRUCTOR_CALL(ADreamGameModeBase) \
	NO_API virtual ~ADreamGameModeBase();
```

**【逐行原理解析】**
- **模块定位**：C++ 语法与生命周期安全模块，规范 C++ 对象构造规则，禁止移动构造和拷贝构造。
- **`= delete;`**：删除非法拷贝与移动，防止对象不被 GC 监测。
- **`DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase);`**：
  - 热重载核心支持：虚表指针修复构造器。
  - 在类内部负责【声明】，展开之后为 `XXX(FVTableHelper& Helper);`。
  - 利用辅助构造函数，在完全不重新执行构造函数业务逻辑的情况下，把对象内存头部“虚表指针重定向到新 DLL 虚表”。
- **`DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(ADreamGameModeBase);`**：
  - 在类内部生成【静态调用桩】，展开之后为 `static UObject* __VTableCtorCaller(FVTableHelper& Helper);`。
  - `return new (EC_InternalUseOnlyConstructor, ...) XXX(Helper);` 利用 placement new 在已有内存上触发构造函数。
- **`DEFINE_DEFAULT_CONSTRUCTOR_CALL(ADreamGameModeBase)`**：
  - 默认构造函数调用桩。蓝图调用 `SpawnActor` 或 C++ 中调用 `NewObject<T>()` 时，通过这个来 new，生成静态函数桩。
- **`virtual ~ADreamGameModeBase();`**：虚析构函数，防泄漏。

---

#### 5. PROLOG、GENERATED_BODY 总成宏与环境清理

```cpp
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_12_PROLOG

#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_GENERATED_BODY \
PRAGMA_DISABLE_DEPRECATION_WARNINGS \
public: \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
private: \
PRAGMA_ENABLE_DEPRECATION_WARNINGS

class ADreamGameModeBase;

// End Class ADreamGameModeBase

#undef CURRENT_FILE_ID
#define CURRENT_FILE_ID FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h

PRAGMA_ENABLE_DEPRECATION_WARNINGS
```

**【逐行原理解析】**
- **`_12_PROLOG`（行号是 `UCLASS()`）**：
  - 为了让 UHT 能识别且 C++ 编译器不报错，所以把 `UCLASS()` 这玩意定义为展开为空。
  - `ObjectMacros.h` 中有定义：`#define UCLASS(...) BODY_MACRO_COMBINE(CURRENT_FILE_ID, _, __LINE__, _PROLOG)`。
  - `CURRENT_FILE_ID`，行号，`_PROLOG` 拼接；`...` 是 C++ 预处理器的原生语法——可变参数宏；PROLOG 前言，作为 class 声明前的宏。
- **`_15_GENERATED_BODY`（总成宏）**：
  - `FID_...._h` 代表着路径编码（File ID）；
  - 数字 `15` 代表着 `GENERATED_BODY` 的行号；
  - 总成宏，负责把反射模块（`INCLASS`）和构造函数模块（`ENHANCED_CONSTRUCTORS`）拼接。
- **`#undef CURRENT_FILE_ID` 与 `#define CURRENT_FILE_ID`**：
  - 取消宏定义，将之前通过 `#define` 创建的宏或标记彻底销毁抹去；
  - 清理环境以及绑定当前文件的全局路径上下文；
  - 直接、间接包含的头文件都会有 `CURRENT_FILE_ID`，为了防止干扰，先抹掉再重新定义；
  - 通过 `BODY_MACRO_COMBINE(CURRENT_FILE_ID, _, x, _PROLOG / _GENERATED_BODY)` 拼接对应 CLASS 以及 GENERATED_BODY；
  - 防止在使用原头文件后再引用其它头文件会导致混乱，所以需要销毁上一个。

---

### 二、Dream_GameModeBase.gen.cpp

#### 1. 头文件包含与跨模块前置声明

```cpp
#include "UObject/GeneratedCppIncludes.h"
#include "Core/Dream_GameModeBase.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS
static_assert(!UE_WITH_CONSTINIT_UOBJECT, "This generated code can only be compiled with !UE_WITH_CONSTINIT_OBJECT");
// cpp文件编译出来的obj目标文件中全是静态变量、模板或者只在别处被间接调用的内部函数，会被某些优化给去除
// 防止链接器在打包的时候将整个gen.cpp文件误删
void EmptyLinkFunctionForGeneratedCodeDream_GameModeBase() {}

// Begin Cross Module References 
// 跨模块引用，先前置函数声明，编译当前文件，在链接的时候再去配对
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase();
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();
ENGINE_API UClass* Z_Construct_UClass_AGameModeBase();
UPackage* Z_Construct_UPackage__Script_Dream();
// End Cross Module References
```
**【逐行原理解析】**
- **`#include`**：引入必要的生成代码基础支持与原类的头文件。
- **`static_assert(...)`**：编译期断言，校验当前的编译环境宏配置。
- **`EmptyLinkFunctionForGeneratedCode...`**：提供一个空的链接符号，防止某些编译器在没有导出函数时优化丢弃整个编译单元。
- **`Begin Cross Module References`**：跨模块函数前置声明，声明本类构造函数、无注册轻量查询函数、父类 `AGameModeBase` 构造函数以及模块包 `UPackage__Script_Dream` 获取函数。

---

#### 2. 类注册信息与私有静态类获取器

```cpp
// Begin Class ADreamGameModeBase 
// 
// StaticClass()的底层实现
// 全局静态结构体变量，充当该类在内存中的”单例指针寄存处与状态注册卡“
// 核心变量UClass* InnerSingleton 初始化为nullptr，一旦这个类的UClass被创建，则直接锁定存于此
FClassRegistrationInfo Z_Registration_Info_UClass_ADreamGameModeBase;
// 写入与获取类的指针
UClass* ADreamGameModeBase::GetPrivateStaticClass()
{
    using TClass = ADreamGameModeBase;
    // 懒加载，首次调用时InnerSingleton为空，执行GetPrivateStaticClassBody然后写入
    // 其余调用直接return
    if (!Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton)
    {
      // 在堆内存中分配空间，把类的参数写入UClass
        GetPrivateStaticClassBody(
          // 传入所属包
            TClass::StaticPackage(),
            // 类的内部反射名字
            TEXT("DreamGameModeBase"),
            // 传入参数引用，用于接收UClass*
            Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton,
            // 原生函数注册器
            StaticRegisterNativesADreamGameModeBase,
            // 类的物理字节大小(内存分配)
            sizeof(TClass),
            // 类的内存对齐字节数
            alignof(TClass),
            // 类标志位
            TClass::StaticClassFlags,
            // 快速类型转换位掩码
            TClass::StaticClassCastFlags(),
            // 配置文件名
            TClass::StaticConfigName(),
            // 类的标准C++构造函数调用桩，通过UClass去new一个该类的对象
            (UClass::ClassConstructorType)InternalConstructor<TClass>,
            // 热重载/Live Coding修复虚函数表专用的辅助构造器桩
            (UClass::ClassVTableHelperCtorCallerType)InternalVTableHelperCtorCaller<TClass>,
            // 类静态函数扩展宏
            UOBJECT_CPPCLASS_STATICFUNCTIONS_FORCLASS(TClass),
            // 父类连接器(传入父类的函数指针， 把类继承树串起来)
            &TClass::Super::StaticClass,
            // 外部归属限制器(默认UObject)
            &TClass::WithinClass::StaticClass
        );
    }
    return Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton;
}
// 跨模块调用接口
// 解决访问权限问题：GetPrivateStaticClass类私有，但头文件中有友元声明
// 跨DLL导出：其它模块在没有引入当前具体类的情况下，只想拿到这个类的UClass*，可以直接通过DLL动态链接直接调用这个全局函数
// NoRegister意味着只保证返回内存中的UClass*指针，不强制触发模块完整级联注册，防止模块间相互依赖引用时产生死锁or循环递归加载
UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister()
{
    return ADreamGameModeBase::GetPrivateStaticClass();
}
```

**【逐行原理解析】**
- **`FClassRegistrationInfo Z_Registration_Info_...`**：保存该类单例指针与注册状态的全局结构体。
- **`GetPrivateStaticClass()`**：懒加载双重检查。当 `InnerSingleton` 为空时，调用 `GetPrivateStaticClassBody` 完成参数传递（包名、类名、单例地址、本地函数注册指针、大小、对齐、类标志位、强转标志、配置名、构造函数包装器、虚表助手调用器、父类 StaticClass、WithinClass）。
- **`Z_Construct_UClass_ADreamGameModeBase_NoRegister()`**：直接内联返回 `ADreamGameModeBase::GetPrivateStaticClass()`，提供轻量级免注册查询入口。

---

#### 3. 静态数据容器结构体声明（Statics）

```cpp
// 类外声明，类内初始化
struct Z_Construct_UClass_ADreamGameModeBase_Statics
{
#if WITH_METADATA
	static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
		{ "Comment", "/**\n * \n */" },
#endif
		{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
		{ "IncludePath", "Core/Dream_GameModeBase.h" },
		{ "ModuleRelativePath", "Public/Core/Dream_GameModeBase.h" },
		{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
	};
#endif // WITH_METADATA

	// Begin Class ADreamGameModeBase constinit property declarations 
	// End Class ADreamGameModeBase constinit property declarations 

	// 假设：float Health 被加上了 UPROPERTY()
	// static const UECodeGen_Private::FFloatPropertyParams NewProp_Health;
	// 属性指针数组
	// static const UECodeGen_Private::FPropertyParamsBase* const PropPointers[];
	// 这两个会出现在类外定义，同理还会有函数、接口的指针数组
  
	// End Class ADreamGameModeBase constinit property declarations 

	// 依赖项声明：一个元素返回值为 UObject* 的函数指针的常量数组
	// 声明该类在构建时所依赖的外部单例，后续在类外会具体填入父类和模块包的构造函数指针
	static UObject* (*const DependentSingletons[])();

	static constexpr FCppClassTypeInfoStatic StaticCppClassTypeInfo = {
		TCppClassTypeTraits<ADreamGameModeBase>::IsAbstract,
	};

	static const UECodeGen_Private::FClassParams ClassParams;
}; // struct Z_Construct_UClass_ADreamGameModeBase_Statics
```

**【逐行原理解析】**
- **`Class_MetaDataParams[]`**：编辑器元数据键值对。让 Unreal Editor 在编辑器中显示类的相关信息（隐藏属性面板 HideCategories，头文件路径，依赖路径）；打包时会被剥离掉（`WITH_METADATA`）省内存。
- **反射属性留白区域**：识别源文件中带有 `UPROPERTY()` 的变量，在注释之间生成关于该变量的内存偏移量和类型描述结构体。
  > 假设：`float Health;` 被加上了 `UPROPERTY()`，这里就会生成 `static const UECodeGen_Private::FFloatPropertyParams NewProp_Health;`，并在结构体外定义内存偏移量。
- **`DependentSingletons[]`（依赖项声明）**：一个元素返回值为 `UObject*` 的函数指针的常量数组；声明该类在构建时所依赖的外部单例，后续在类外会具体填入父类和模块包的构造函数指针。
- **`StaticCppClassTypeInfo`（C++ 抽象类特征萃取）**：记录这个类在 C++ 层面是不是一个纯虚抽象类；True 则蓝图和引擎禁止直接实例化。
- **`ClassParams`**：将信息汇总 + ClassFlags 标志位（`0x009002ACu`）传递给 `ConstructUClass`。

---

#### 4. 依赖项连接与类参数打包配置

```cpp
// 函数指针，指向依赖的单例对象(父类和模块包)，用于在运行时获取这些对象的引用
// 连接父类与模块包，保证父类以及虚拟路径先于该类被创建
UObject* (*const Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons[])() = {
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	(UObject* (*)())Z_Construct_UPackage__Script_Dream,
};

// 通过static_assert确保依赖的单例总数不超过16个
// 依赖项构成精简：设计设想只继承这个类的直接父类、所属模块包以及继承实现的UINTERFACE接口
// 栈上固定小内存优化：引擎底层ConstructUClass在递归解析依赖单例时，内部使用大小固定为16的紧凑数组直接在CPU栈上跑循环，避免了堆内存分配开销
// 架构防呆：防止开发者过度设计
static_assert(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons) < 16);

// 打包类信息
const UECodeGen_Private::FClassParams Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams = {
	&ADreamGameModeBase::StaticClass,
	"Game",
	&StaticCppClassTypeInfo,
	DependentSingletons,
	nullptr,
	nullptr,
	nullptr,
	UE_ARRAY_COUNT(DependentSingletons),
	// 函数数量、属性数量、接口数量 (均为 0)
	0,
	0,
	0,
	0x009002ACu,
	METADATA_PARAMS(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams), Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams)
};
```
**【逐行原理解析】**
- **`DependentSingletons` 初始化**：
  - 对上面 `Z_Construct_UClass_ADreamGameModeBase_Statics` 结构体声明的初始化；
  - 连接父类（`AGameModeBase`）与所属模块包（Package），虚拟对象路径（`/Script/Dream`）；
  - `Script`：UE 顶级挂载点，用于存放所有 C++ 原生代码编译出来的类、结构体和枚举；`Dream`：模块名；
  - 内存中完整的对象路径为：`/Script/Dream.DreamGameModeBase`。
- **`ClassParams` 打包项**：
  - `&ADreamGameModeBase::StaticClass`：指向类的静态获取函数；
  - `"Game"`：读取并写入 Game.ini 配置文件；
  - `&StaticCppClassTypeInfo`：算得的抽象特征传入；
  - `DependentSingletons`：传入上面的父类与模块包依赖链；
  - 函数列表、属性列表、接口列表（此处为 `nullptr`，数量为 0）；
  - 依赖项数量：`UE_ARRAY_COUNT(DependentSingletons)`；
  - `0x009002ACu`：所有运行态特征的 32 位类标志位；
  - `METADATA_PARAMS(...)`：编辑器元数据字典。

---

#### 5. 类构造实现与虚表助手补丁

```cpp
// 将C++注册到蓝图虚拟机
// 被GetPrivateStaticClass()函数调用
void ADreamGameModeBase::StaticRegisterNativesADreamGameModeBase()
{
  // 识别UFUNCTION()，在此生成：
  // 取得类的指针地址
  // UClass* Class = ADreamGameModeBase::StaticClass();
  // 建立名称-地址映射表
  // static const FNameNativePtrPair Funcs[] = {
  //   { "函数名",
  //     &ADreamGameModeBase::exec函数名
  //   },
  // };
  // 将映射表写入UClass内部的函数查找表中
  // FNativeFunctionRegistrar::RegisterFunctions(Class, Funcs, UE_ARRAY_COUNT(Funcs));
  // exec函数名是UHT自动生成的C++包装桩函数地址
}

// 判断单例是否存在，如果不存在就触发构建
UClass* Z_Construct_UClass_ADreamGameModeBase()
{
	if (!Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton)
	{
		UECodeGen_Private::ConstructUClass(Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton, Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams);
	}
	return Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton;
}

// 实现带有FVTableHelper& Helper的构造函数
// ADreamGameModeBase::ADreamGameModeBase(FVTableHelper& Helper) : Super(Helper) 
DEFINE_VTABLE_PTR_HELPER_CTOR_NS(, ADreamGameModeBase);
ADreamGameModeBase::~ADreamGameModeBase() {}
// End Class ADreamGameModeBase
```

**【逐行原理解析】**
- **`StaticRegisterNativesADreamGameModeBase()`**：静态原生函数注册体（若有 UFUNCTION 则在此处向虚拟机登记）。
- **`Z_Construct_UClass_ADreamGameModeBase()`**：判断单例是否存在，如果不存在就触发构建，调用 `UECodeGen_Private::ConstructUClass` 构造 UClass 对象。
- **`DEFINE_VTABLE_PTR_HELPER_CTOR_NS(...)`**：实现带有 `FVTableHelper& Helper` 的构造函数，展开为 `ADreamGameModeBase::ADreamGameModeBase(FVTableHelper& Helper) : Super(Helper) {}`。

---

#### 6. 编译入库延迟注册器（CompiledInDefer 机制）

```cpp
// Begin Registration
struct Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics
{
	static constexpr FClassRegisterCompiledInInfo ClassInfo[] = {
		{ Z_Construct_UClass_ADreamGameModeBase, ADreamGameModeBase::StaticClass, TEXT("ADreamGameModeBase"), &Z_Registration_Info_UClass_ADreamGameModeBase, CONSTRUCT_RELOAD_VERSION_INFO(FClassReloadVersionInfo, sizeof(ADreamGameModeBase), 2001584642U) },
	};
}; 

static FRegisterCompiledInInfo Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_2698426432{
	TEXT("/Script/Dream"),
	Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo, UE_ARRAY_COUNT(Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo),
	nullptr, 0,
	nullptr, 0,
};
// End Registration

PRAGMA_ENABLE_DEPRECATION_WARNINGS
```

**【逐行原理解析】**
- **延迟注册初衷**：由于 C++ 没有遍历 DLL 所有类的功能，所以需要 DLL 在加载时主动注册。利用 C++ 特性：所有全局静态变量会在 DLL 被载入内存的瞬间、在任何普通业务代码运行之前，由操作系统自动执行其初始化构造。结构体相当于给你一个表，然后让你按照这个表填信息（可以有 ClassInfo、EnumInfo、StructInfo，里面的 `{}` 取决于定义了多少个类、枚举、结构体）。
- **`ClassInfo` 静态数组**：每一项代表当前头文件定义的一个反射类：
  - `Z_Construct_UClass_ADreamGameModeBase`：创建函数的指针；
  - `ADreamGameModeBase::StaticClass`：静态获取函数的指针；
  - `TEXT("ADreamGameModeBase")`：类名字符串，供引擎通过名字反查类（反射查询）；
  - `&Z_Registration_Info_UClass_ADreamGameModeBase`：保存该类单例指针与注册状态的结构体地址；
  - `CONSTRUCT_RELOAD_VERSION_INFO`：`sizeof(ADreamGameModeBase)` 为该类在内存中的字节大小；`2001584642U` 为类结构的 CRC 校验哈希值，UHT 根据该类声明的成员变量计算出的唯一哈希码，新增 or 删除变量都会更改（热重载用于比对）。
- **`FRegisterCompiledInInfo` 全局静态变量**：
  - 系统在把 DLL 装载进内存时，操作系统加载器发现有全局变量需要初始化，会调用 `FRegisterCompiledInInfo` 的构造函数；
  - **变量名构成**：前缀 `Z_` + 行为意图 `CompiledInDeferFile_` + 来源路径 + 所属模块包 + 神秘数字（校验码）；
  - `CompiledInDeferFile`：编译入库文件的延迟注册器；
  - **校验码的作用**：UBT 会把多个 cpp 打包成一个大的 cpp 加速编译，防止出现类似名称，用于确保唯一性；
  - 传入参数：模块包路径 + 本文件包含的类列表及数量（`ClassInfo` 和 `UE_ARRAY_COUNT(ClassInfo)`） + 本文件包含的结构体（USTRUCT）及数量 + 本文件包含的枚举（UENUM）及数量；
  - **命名空间隔离策略**：防止多个文件的 `ClassInfo` 数组冲突。

---

#### 6. 属性与属性指针数组生成深度拆解

以属性 `float Health` 为例，UHT 在生成代码时会将其拆分为专属描述结构体与指针数组：

**`NewProp_Health` 属性描述定义：**
```cpp
const UECodeGen_Private::FFloatPropertyParams Z_Construct_UClass_ADreamGameModeBase_Statics::NewProp_Health = {
  // 变量名字符串
  "Health",
  // 状态通知函数(RepNotify)
  nullptr,
  // 属性修饰标志符
  (EPropertyFlags)0x0010000000000000,
  // 类型标签
  UECodeGen_Private::EPropertyFlags::Float,
  // 对象标志符
  RF_Public|RF_Transient|RF_MarkAsNative,
  // 拥有者
  nullptr,
  // 外部元数据
  nullptr,
  // 数组元素个数(非数组为1)
  1,
  // 计算变量在类内存里的真实字节偏移量
  // 反射最底层的物理依据：引擎通过字符串读写属性时，底层执行就是拿对象的首地址指针 this，加上这里算出来的字节偏移量定位到浮点数内存
  STRUCT_OFFSET(ADreamGameModeBase, Health),
  // 属性专属元数据
  METADATA_PARAMS(0, nullptr)
};
```

**`PropPointers[]` 属性指针数组：**
```cpp
// 属性指针数组
const UECodeGen_Private::FPropertyParamsBase* const Z_Construct_UClass_ADreamGameModeBase_Statics::PropPointers[] = {
  (const UECodeGen_Private::FPropertyParamsBase*)&Z_Construct_UClass_ADreamGameModeBase_Statics::NewProp_Health,
};
```

---

## 部分概念深度专题

### 1. 桩（Thunk）

**问题**：在 new 一个具体对象时，C++ 必须在编译时就知道具体类型。但是虚幻底层生成函数 `SpawnActor`，`NewObject` 等，只接收一个通用的 `UClass*` 指针，底层 C++ 不可能提前 `#include` 项目中的头文件，也就是编译时无法得知这个类。

于是乎便有了这个本质通用转接头的桩。

引擎底层规定好统一且不依赖具体类型的函数指针格式：
```cpp
typedef UObject* (*ClassVTableHelperCtorCallerType)(FVTableHelper&);
```

而在 `generated.h` 内部知道具体类型之后，就写一个静态小函数：
```cpp
static UObject* __VTableCtorCaller(FVTableHelper& Helper)
{
	// EC_InternalUseOnlyConstructor(内部专用标记)内部枚举标记(EInternalUseOnlyConstructor)
	// C++重载operator new版本多
	// UObject重载了多个operator new，需要靠标记区分，直接new不允许
	// (UObject*)GetTransientPackage()(临时包指针)获取虚幻全局Transient Package
	// UObject诞生时必须挂载在父容器(Outer)名下，用完就丢
	return new (EC_InternalUseOnlyConstructor, (UObject*)GetTransientPackage()) ADreamGameModeBase(Helper);
}
```

因为标准 C++ 没提供任何语法获取“虚函数表内存地址”，所以执行步骤如下：
```text
1. 引擎调用 __VTableCtorCaller
   └──> 2. 借助 FVTableHelper 快速在内存中 new 出一个临时的“工具人”假对象
          （因为函数体是空的，不执行任何游戏逻辑，开销极小且瞬间完成）
   └──> 3. C++ 编译器在 new 的瞬间，自动把【新虚表地址】填入了假对象的头部（vptr）
   └──> 4. 引擎偷偷从这个假对象头部把【新虚表地址】扣下来
   └──> 5. 引擎遍历内存中早已存在的活体对象，把它们头部的虚表指针批量替换成新地址
   └──> 6. 销毁假对象，完成热重载！
```

启动时，把桩函数地址 `&__VTableCtorCaller` 存进 UClass 属性，需要热重载时，拿出来直接调用函数指针，直接调用具体类的构造函数。

---

### 2. NO_API

在宏定义展开后，`NO_API` 通常就是一个“空值（Empty）”。

**1. 通用宏模板的"占位符"**
```cpp
DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase);
// 定义原型：
// USE_VTABLE_PTR_HELPER_CTOR作为编译开关
// 编辑器/开发阶段时，为1，这段代码会进去，所以会有Live Coding热重载
// 在最终打包发布时，为0，宏展开为空白，即不编译这个
#if USE_VTABLE_PTR_HELPER_CTOR
    #define DECLARE_VTABLE_PTR_HELPER_CTOR(ApiMacro, ClassName)\
        ApiMacro ClassName(FVTableHelper& Helper);
#else
    #define DECLARE_VTABLE_PTR_HELPER_CTOR(ApiMacro, ClassName)
#endif
```

第一个参数要求传一个"导出宏"：
- 属于引擎核心模块，且该构造函数必须暴露给其他 DLL 使用，会传入 `ENGINE_API`（`__declspec(dllexport)`）；
- 不需要向外导出函数 or 不需要跨模块调用，通过 `NO_API` 来占位。

**2. 明确语义：不导出符号**  
`NO_API`：展开为空白，表示本地私有/模块内自用，绝不把符号公开到 DLL 导出表，只在本模块内部可用。

---

### 3. 反射宏设计

很多时候源码中定义了很多 UE 的反射类，这些 UHT 能识别，但是 C++ 编译器是不通过的，所以需要一个空的宏定义来让其接受这些反射类。如果反射宏 `()` 内有内容，则由 UHT 翻译成静态数据写入 `gen.cpp` 和反射标志位中。

#### 1. 变成运行时的二进制标志位（ClassFlags）
决定这个类在游戏运行时的底层行为规则，会被 UHT 编译成一个 32 位整型掩码：
```cpp
DECLARE_CLASS2(ADreamGameModeBase, AGameModeBase, COMPILED_IN_FLAGS(0 | CLASS_Transient | CLASS_Config), CASTCLASS_None, TEXT("/Script/Dream"), Z_Construct_UClass_ADreamGameModeBase_NoRegister)
```

这里的 `CLASS_Transient | CLASS_Config` 就是读取类修饰词后直接硬编码写入的标志位：
- **Abstract**：将类标记为抽象类，禁止任何人在游戏里直接实例化它；
- **Transient**：瞬态类，告诉引擎这个类的对象永远不要被存盘或保存到关卡资产中；
- **Config = Game**：指定该类拥有读取和保存配置文件的能力（对应 `Saved/Config/Windows/Game.ini`）；
- **DefaultConfig**：类的配置必须写入默认配置文件。

```cpp
0x009002ACu
```
这个 16 进制常数是由类标志位通过按位或（`|`）运算计算得出的整型掩码。

运行时使用：调用 `SpawnActor` 时，用位运算检查：
```cpp
// 如检查是否为抽象类，还有CLASS_NewerVersionExists/CLASS_Deprecated，拒绝生成老版本/废弃类
if (CurrentClass->HasAnyClassFlags(CLASS_Abstract))
{
    // 如果是抽象类，引擎直接中断生成并弹出警告
    return nullptr;
}
```

#### 2. 变成编辑器元数据键值对表（MetaData）
给编辑器看的信息 Key，与游戏逻辑运行无关，UHT 将转变为静态键值对数组：
```cpp
#if WITH_METADATA
static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
	{ "Comment", "/**\n * \n */" },
#endif
	{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
	{ "IncludePath", "Core/Dream_GameModeBase.h" },
	{ "ModuleRelativePath", "Public/Core/Dream_GameModeBase.h" },
	{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
};
#endif // WITH_METADATA
```

须知：这里分两种，一种是开发者主动声明的业务元数据，一种是 UHT 自动抓取的工程系统级元数据：
- `UCLASS()` 中声明的 `DisplayName`、`HideCategories`、`Category`，用于控制编辑器界面该如何渲染这个类；
- `Comment`（代码注释）、`IncludePath`、`ModuleRelativePath` 是解析时打包放入：
  - **作用 1**：编辑器内"打开源码"，通过 `Class->GetMetaData(TEXT("ModuleRelativePath"))` 拿到相对路径并唤醒 IDE 打开；
  - **作用 2**：自动生成代码时的 `#include` 插入器，引擎工具或蓝图自动生成关联代码时，代码工具需知引用这个类要用什么 `#include`，通过 `Class->GetMetaData(TEXT("IncludePath"))` 拿到头文件路径并自动拼成包含语句；
  - **作用 3**：编辑器悬浮文档与类浏览器显示，弹窗显示 Comment 元数据，用于描述类的功能，IncludePath 元数据显示定义在哪个模块的哪个头文件。

常用项：
- `DisplayName = "玩家模式基类"`：在蓝图搜索列表或类下拉框中显示的名字；
- `HideCategories = "Rendering Collision Input"`：在细节面板（Details Panel）中隐藏不相关的属性分类；
- `ShowCategories = "Input|MouseInput"`：强制显示某些特定分类；
- `ToolTip = "..."`：鼠标悬停在类名上时弹出的注释提示（UHT 甚至会自动抓取你写在类上方的 C++ `/** ... */` 注释自动转成这个）。

#### 3. 引擎架构的路由配置
定义了该类在虚幻对象层级体系中的组织归宿：
```cpp
UObject* (*const Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons[])() = {
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	(UObject* (*)())Z_Construct_UPackage__Script_Dream,
};
```
UHT 把类与父类（`AGameModeBase`）以及专属包（`UPackage__Script_Dream`）的构造函数指针捆绑成依赖链条，保证在构建这个类之前，父类和父包必须先存在。
- **Within = Engine**：规定该类的实例必须依附于某类特定的外部对象（Outer），不能随意挂载；
- **模块与包路径**：UHT 根据该类所在的文件夹目录，自动推导出它所属的虚拟包路径 `/Script/Dream`。

**总结**：  
引擎启动时，真正的构造函数 `UECodeGen_Private::ConstructUClass` 读取：
1. 标志位，存进内存中 UClass 对象中的 `ClassFlags` 成员；
2. `Class_MetaDataParams` 字符串表，存进内存中 UClass 的元数据字典；
3. `DependentSingletons` 指针，把类挂载到父类继承树和包路径下。

---

### 4. UHT 的工作流程

**UHT 生成阶段**：  
代码生成时：
1. C++ 编译开始之前，UHT 打开原始头文件；
2. 扫描出文件物理路径，推算专属前缀（key）；
3. UHT 在生成 `generated.h` 时提前写好 define 定义。

**C++ 预处理器阶段**：  
`#include` 物理展开：将上面生成的文件原封不动放回头文件中。

**拼接阶段**：  
1. 预处理器读到 `GENERATED_BODY()`；
2. 引擎会用 `BODY_MACRO_COMBINE(CURRENT_FILE_ID, _, __LINE__, _GENERATED_BODY)`；
3. 预处理器代入去拼接后查询 `generated.h` 有没有已经定义好的宏，有则直接替换进去。

**总结**：  
把通过 UHT 分析且提前生成需要的宏定义，通过 `generated.h` 的引入提前插入到 C++ 头文件中，然后通过拼接的宏定义来确认是否已经有宏定义了。

---

### 5. Defer（延迟注册机制）

#### CompiledInDeferFile
不把 UClass 直接创建出来的原因：DLL 载入内存时，UE 的核心子系统未初始化完毕，缺少 GC，全局对象数组 `GUObjectArray` 未分配内存，如果贸然分配内存创建，会导致崩溃闪退。

**时序总览**：
```
1. 操作系统载入 UnrealEditor-Dream.dll
       │
       ▼
2. 触发 static 全局变量 Z_CompiledInDeferFile... 的初始化构造
       │
       ▼
3. 将包含类名、CRC 哈希和创建函数指针的 ClassInfo 提交到引擎全局待办列表
       │
       ▼
4. [延迟等待] 引擎核心组件（GC、内存池、对象系统）初始化完毕
       │
       ▼
5. 引擎统一遍历待办列表，调用 Z_Construct_UClass_ADreamGameModeBase 正式诞生 UClass
```

#### static constexpr
`static constexpr` 是 C++11 引入的关键字组合，用于优化性能：
- **static（静态）**：属于类型本身，不属于某个对象实例，通过结构体名称 + `::ClassInfo` 访问，全局只存在一份；
- **constexpr（常量表达式）**：在编译时计算出值，而不是在运行时计算：
  - 普通变量：运行且内存分配后，CPU 一条条写入（运行时开销）；
  - `constexpr` 变量：在编译生成 DLL 时，直接算好硬编码到 DLL 文件中的只读数据段（`.rdata`）；
  - CPU 无需初始化，在内存加载时就绪，零运行时开销。

---

### 6. static_assert 编译期断言

`static_assert` 是 C++11 引入的编译时断言宏，用于在编译时检查条件是否满足。

**与普通 assert 区别：**
- **`static_assert`（编译时断言）**：不依赖于运行时条件，因此不会产生运行时开销；如果不满足条件，编译期直接报错，生成二进制文件后语句完全从程序中消失，零指令开销；
- **普通 `assert`（运行时断言）**：依赖运行时数据，如果条件不满足会在运行时抛出异常或中断崩溃，且在 Shipping 发布构建中通常会被剥离。

---

### 7. UHT 三种核心指针数组

在类生成的 `Statics` 容器中，UHT 会组织三种核心指针数组分别管理类的反射成员：
- **`PropPointers`**：属性指针数组
- **`FuncInfo`**：函数链接信息数组
- **`InterfaceInfo`**：接口实现信息数组

#### (1) 属性指针数组（PropPointers）
```cpp
const UECodeGen_Private::FPropertyParamsBase* const ...::PropPointers[] = {
  (const UECodeGen_Private::FPropertyParamsBase*)&...::NewProp_CardDataTable,
};
```

- **数组类型**：基类指针数组 `FPropertyParamsBase* const[]`；
- **元素实质**：根据具体的数据类型，指向不同的特化结构体：
  - 普通对象指针：`FObjectPropertyParams`
  - 字符串：`FStrPropertyParams`
  - 结构体：`FStructPropertyParams`
  - 动态数组：`FArrayPropertyParams`
  - 布尔值：`FBoolPropertyParams`

#### (2) 函数链接信息数组（FuncInfo）
```cpp
static constexpr FClassFunctionLinkInfo FuncInfo[] = {
  // 函数构造器指针, "函数名" 
  { &Z_Construct_UFunction_UDreamCardPoolSubsystem_GetArrayCard, "GetArrayCard" },
};
```

#### (3) 接口实现信息数组（InterfaceInfo）
```cpp
static const UECodeGen_Private::FImplementedInterfaceParams InterfaceInfo[] = {
    { 
        // 接口的 UClass 构造函数
        (UObject* (*)())Z_Construct_UClass_UCombatInterface,
        // 虚函数表偏移量(VTable Offset)
        VTABLE_OFFSET(AMyCharacter, ICombatInterface),
        // 是否由蓝图 K2 纯脚本实现
        false
    },
};
```

- **多重继承地址移动**：C++ 多重继承会导致类对象的指针地址在转换为接口基类时发生偏移，`VTABLE_OFFSET` 预先算好并记录该偏移差值；
- **核心作用**：
  - 在蓝图或 C++ 中使用 `Cast<ICombatInterface>(MyActor)` 时，能瞬间计算出正确的接口指针；
  - 支撑 `MyActor->GetClass()->ImplementsInterface(...)` 的快速 O(1) 真伪判定。
